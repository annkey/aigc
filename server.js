const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { URL } = require("node:url");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const envPath = path.join(rootDir, ".env.local");
const generatorSettingsPath = path.join(rootDir, "generator-settings.json");
const adminUsersPath = path.join(rootDir, "admin-users.json");

loadEnvFile(envPath);

const PORT = Number(process.env.PORT || 3000);
const TRIPO_API_KEY = process.env.TRIPO_API_KEY || "";
const TRIPO_API_BASE = "https://api.tripo3d.ai/v2/openapi";
const MESHY_API_KEY = process.env.MESHY_API_KEY || "";
const MESHY_API_BASE = "https://api.meshy.ai";
const GENERATOR_API_BASE = normalizeApiBase(process.env.GENERATOR_API_BASE || "");

const TRIPO_FINAL_STATUSES = new Set([
  "success",
  "failed",
  "banned",
  "expired",
  "cancelled",
  "unknown"
]);

const NORMALIZED_FINAL_STATUSES = new Set([
  "success",
  "failed",
  "cancelled",
  "expired",
  "unknown"
]);

const meshyTaskContexts = new Map();
const meshyRefineTasks = new Map();
const optimizationTaskContexts = new Map();
const generatedTaskRecords = new Map();
const playerClientSessions = new Map();
const PLAYER_CLIENT_ACTIVE_MS = 2 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm"
};

const GENERATOR_PROVIDER_OPTIONS = {
  tripo: {
    name: "Tripo3D",
    defaultModelVersion: "P1-20260311",
    modelVersions: [
      { value: "P1-20260311", label: "P1-20260311" },
      { value: "v3.1-20260211", label: "v3.1-20260211" },
      { value: "v2.5-20250123", label: "v2.5-20250123" }
    ]
  },
  meshy: {
    name: "Meshy",
    defaultModelVersion: "latest",
    modelVersions: [
      { value: "latest", label: "latest (Meshy 6)" },
      { value: "meshy-6", label: "meshy-6" },
      { value: "meshy-5", label: "meshy-5" }
    ]
  }
};

const OPTIMIZATION_PROVIDER_OPTIONS = {
  tripo: {
    name: "Tripo3D",
    defaultModelVersion: "P1-20260311",
    modelVersions: GENERATOR_PROVIDER_OPTIONS.tripo.modelVersions,
    operations: {
      retexture: false,
      split: false
    }
  },
  meshy: {
    name: "Meshy",
    defaultModelVersion: "latest",
    modelVersions: GENERATOR_PROVIDER_OPTIONS.meshy.modelVersions,
    operations: {
      retexture: true,
      split: false
    }
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }

    await handleStatic(req, res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: "ServerError",
      message: error instanceof Error ? error.message : "Unknown server error."
    });
  }
});

server.listen(PORT, () => {
  console.log(`3D app running at http://localhost:${PORT}`);
});

async function handleApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/config") {
    sendJson(res, 200, buildLocalGeneratorConfigResponse());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/assets") {
    sendJson(res, 200, buildAdminAssetResponse());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/clients") {
    sendJson(res, 200, buildAdminClientResponse());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/admin/users") {
    sendJson(res, 200, buildAdminUserResponse());
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/admin/users") {
    try {
      const request = toWebRequest(req, requestUrl);
      const payload = await request.json();
      sendJson(res, 201, {
        ok: true,
        user: createAdminUser(payload),
        ...buildAdminUserResponse()
      });
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "AdminUserCreateFailed",
        message: error.message || "Failed to create user."
      });
      return;
    }
  }

  const adminUserMatch = requestUrl.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserMatch && req.method === "PUT") {
    try {
      const request = toWebRequest(req, requestUrl);
      const payload = await request.json();
      sendJson(res, 200, {
        ok: true,
        user: updateAdminUser(adminUserMatch[1], payload),
        ...buildAdminUserResponse()
      });
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "AdminUserUpdateFailed",
        message: error.message || "Failed to update user."
      });
      return;
    }
  }

  if (adminUserMatch && req.method === "DELETE") {
    try {
      deleteAdminUser(adminUserMatch[1]);
      sendJson(res, 200, buildAdminUserResponse());
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "AdminUserDeleteFailed",
        message: error.message || "Failed to delete user."
      });
      return;
    }
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/player-session") {
    try {
      const request = toWebRequest(req, requestUrl);
      const payload = await request.json();
      const session = upsertPlayerClientSession(payload, req);
      sendJson(res, 200, {
        ok: true,
        sessionId: session.sessionId,
        active: session.active
      });
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "PlayerSessionUpdateFailed",
        message: error.message || "Failed to update player session."
      });
      return;
    }
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/generator-settings") {
    try {
      const request = toWebRequest(req, requestUrl);
      const payload = await request.json();
      const savedSettings = saveGeneratorSettings(payload);
      sendJson(res, 200, {
        ok: true,
        message: "Generator settings saved.",
        generatorSettings: savedSettings,
        ...buildLocalGeneratorConfigResponse()
      });
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "GeneratorSettingsSaveFailed",
        message: error.message || "Failed to save generator settings.",
        details: error.details || null
      });
      return;
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/generate") {
    try {
      const request = toWebRequest(req, requestUrl);
      const form = await request.formData();
      const generatorSettings = getGeneratorSettings();
      const providers = buildProviderConfigMap();
      const requestedProvider = normalizeProvider(form.get("provider"));
      const provider = providers[requestedProvider]?.enabled ? requestedProvider : generatorSettings.provider;
      const modelVersion = resolveModelVersion(provider, form.get("modelVersion"), providers);
      form.set("provider", provider);
      form.set("modelVersion", modelVersion);

      if (GENERATOR_API_BASE) {
        const remoteResult = await proxyRemoteJson("/api/generate", {
          method: "POST",
          body: form
        });
        const responseBody = {
          ...remoteResult,
          generatorApiBase: GENERATOR_API_BASE,
          proxied: true
        };
        recordGeneratedTask(responseBody, {
          provider,
          modelVersion,
          mode: form.get("mode"),
          prompt: form.get("prompt")
        });
        sendJson(res, 200, responseBody);
        return;
      }

      if (provider === "meshy") {
        await handleMeshyGenerate(res, form);
      } else {
        await handleTripoGenerate(res, form);
      }
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "GenerationFailed",
        message: error.message || "Failed to create task.",
        details: error.details || null
      });
      return;
    }
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/model-optimize") {
    try {
      const request = toWebRequest(req, requestUrl);
      const form = await request.formData();

      if (GENERATOR_API_BASE) {
        try {
          const remoteResult = await proxyRemoteJson("/api/model-optimize", {
            method: "POST",
            body: form
          });
          sendJson(res, 200, {
            ...remoteResult,
            generatorApiBase: GENERATOR_API_BASE,
            proxied: true
          });
          return;
        } catch (error) {
          if (error.status && error.status !== 404 && error.status !== 501) {
            throw error;
          }
        }
      }

      await handleModelOptimize(res, form);
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "ModelOptimizeFailed",
        message: error.message || "Failed to create optimization task.",
        details: error.details || null
      });
      return;
    }
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/task/")) {
    const taskId = requestUrl.pathname.split("/").pop();
    const provider = normalizeProvider(requestUrl.searchParams.get("provider"));

    if (!taskId) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Missing task id."
      });
      return;
    }

    try {
      if (GENERATOR_API_BASE) {
        const remoteTask = await proxyRemoteJson(`/api/task/${encodeURIComponent(taskId)}?provider=${encodeURIComponent(provider)}`);
        const responseBody = {
          ...remoteTask,
          generatorApiBase: GENERATOR_API_BASE,
          proxied: true
        };
        recordGeneratedTask(responseBody, { provider, taskId });
        sendJson(res, 200, responseBody);
        return;
      }

      if (provider === "meshy") {
        await handleMeshyTaskQuery(res, taskId);
      } else {
        await handleTripoTaskQuery(res, taskId);
      }
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "TaskQueryFailed",
        message: error.message || "Failed to query task.",
        details: error.details || null
      });
      return;
    }
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/api/model-optimize/task/")) {
    const taskId = requestUrl.pathname.split("/").pop();
    const provider = normalizeProvider(requestUrl.searchParams.get("provider"));
    const operation = normalizeOptimizationOperation(requestUrl.searchParams.get("operation"));

    if (!taskId) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Missing optimization task id."
      });
      return;
    }

    try {
      if (GENERATOR_API_BASE) {
        try {
          const remoteTask = await proxyRemoteJson(
            `/api/model-optimize/task/${encodeURIComponent(taskId)}?provider=${encodeURIComponent(provider)}&operation=${encodeURIComponent(operation)}`
          );
          sendJson(res, 200, {
            ...remoteTask,
            generatorApiBase: GENERATOR_API_BASE,
            proxied: true
          });
          return;
        } catch (error) {
          if (error.status && error.status !== 404 && error.status !== 501) {
            throw error;
          }
        }
      }

      await handleModelOptimizeTaskQuery(res, taskId, provider, operation);
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "ModelOptimizeTaskQueryFailed",
        message: error.message || "Failed to query optimization task.",
        details: error.details || null
      });
      return;
    }
  }

  if ((req.method === "GET" || req.method === "HEAD") && requestUrl.pathname === "/api/asset") {
    try {
      await handleAssetProxy(req, res, requestUrl);
      return;
    } catch (error) {
      sendJson(res, error.status || 400, {
        error: "AssetProxyFailed",
        message: error.message || "Failed to proxy asset.",
        details: error.details || null
      });
      return;
    }
  }

  sendJson(res, 404, {
    error: "NotFound",
    message: "API route not found."
  });
}

async function handleTripoGenerate(res, form) {
  ensureProviderEnabled("tripo");

  const mode = String(form.get("mode") || "text");
  const modelVersion = String(form.get("modelVersion") || "P1-20260311");
  const textureQuality = String(form.get("textureQuality") || "standard");
  const geometryQuality = String(form.get("geometryQuality") || "standard");
  const prompt = normalizeText(form.get("prompt"));
  const negativePrompt = normalizeText(form.get("negativePrompt"));
  const imageFile = form.get("image");

  let payload;
  let uploadInfo = null;

  if (mode === "image") {
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Image mode requires an uploaded image."
      });
      return;
    }

    uploadInfo = await uploadImageToTripo(imageFile);

    if (!uploadInfo.image_token) {
      sendJson(res, 400, {
        error: "UploadFailed",
        message: "Tripo upload did not return image_token.",
        details: uploadInfo.raw || null
      });
      return;
    }

    payload = {
      type: "image_to_model",
      model_version: modelVersion,
      file: {
        type: mapMimeToTripoFileType(imageFile.type),
        file_token: uploadInfo.image_token
      }
    };

    if (supportsTextureQuality(modelVersion)) {
      payload.texture_quality = textureQuality;
    }

    if (supportsOrientation(modelVersion)) {
      payload.orientation = "align_image";
    }
  } else {
    if (!prompt) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Text mode requires a prompt."
      });
      return;
    }

    payload = {
      type: "text_to_model",
      model_version: modelVersion,
      prompt
    };

    if (negativePrompt) {
      payload.negative_prompt = negativePrompt;
    }

    if (supportsTextureQuality(modelVersion)) {
      payload.texture_quality = textureQuality;
    }

    if (supportsGeometryQuality(modelVersion)) {
      payload.geometry_quality = geometryQuality;
    }
  }

  const tripoResponse = await tripoFetch("/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const createResult = unwrapTripoData(tripoResponse);

  const responseBody = {
    ok: true,
    provider: "tripo",
    providerName: "Tripo3D",
    mode,
    taskId: createResult.task_id || null,
    displayModelVersion: modelVersion,
    payload,
    upload: uploadInfo,
    raw: tripoResponse
  };

  recordGeneratedTask(responseBody, {
    provider: "tripo",
    providerName: "Tripo3D",
    mode,
    prompt,
    modelVersion
  });
  sendJson(res, 200, responseBody);
}

async function handleTripoTaskQuery(res, taskId) {
  ensureProviderEnabled("tripo");

  const task = await tripoFetch(`/task/${taskId}`, { method: "GET" });
  const taskResult = unwrapTripoData(task);
  const output = taskResult.output || {};
  const preferredModelUrl = output.model || output.pbr_model || output.base_model || null;

  const responseBody = {
    ok: true,
    provider: "tripo",
    providerName: "Tripo3D",
    mode: inferTripoMode(taskResult.type),
    taskId: taskResult.task_id || taskId,
    type: taskResult.type,
    status: taskResult.status,
    statusText: taskResult.status,
    progress: typeof taskResult.progress === "number" ? taskResult.progress : 0,
    finalized: TRIPO_FINAL_STATUSES.has(taskResult.status),
    stageText: "Tripo3D 生成任务",
    displayModelVersion: taskResult.input?.model_version || "",
    input: taskResult.input || {},
    output,
    renderedImage: output.rendered_image || output.generated_image || null,
    preferredModelUrl,
    modelUrls: {
      model: output.model || null,
      pbrModel: output.pbr_model || null,
      baseModel: output.base_model || null
    },
    downloadItems: buildTripoDownloadItems(output),
    raw: task
  };

  recordGeneratedTask(responseBody, { provider: "tripo", taskId });
  sendJson(res, 200, responseBody);
}

async function handleMeshyGenerate(res, form) {
  ensureProviderEnabled("meshy");

  const mode = String(form.get("mode") || "text");
  const modelVersion = String(form.get("modelVersion") || "latest");
  const textureQuality = String(form.get("textureQuality") || "standard");
  const geometryQuality = String(form.get("geometryQuality") || "standard");
  const prompt = normalizeText(form.get("prompt"));
  const auxiliaryPrompt = normalizeText(form.get("negativePrompt"));
  const imageFile = form.get("image");

  let payload;
  let endpoint;

  if (mode === "image") {
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Image mode requires an uploaded image."
      });
      return;
    }

    if (!["image/png", "image/jpeg"].includes(imageFile.type)) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Meshy image mode only supports PNG or JPEG images."
      });
      return;
    }

    payload = {
      image_url: await fileToDataUri(imageFile),
      ai_model: modelVersion,
      model_type: geometryQuality === "lowpoly" ? "lowpoly" : "standard",
      should_texture: true,
      enable_pbr: textureQuality === "detailed",
      moderation: false,
      image_enhancement: true,
      remove_lighting: true,
      target_formats: ["glb", "fbx", "obj", "stl"]
    };

    endpoint = "/openapi/v1/image-to-3d";
  } else {
    if (!prompt) {
      sendJson(res, 400, {
        error: "ValidationError",
        message: "Text mode requires a prompt."
      });
      return;
    }

    payload = {
      mode: "preview",
      prompt,
      ai_model: modelVersion,
      model_type: geometryQuality === "lowpoly" ? "lowpoly" : "standard",
      moderation: false,
      target_formats: ["glb", "fbx", "obj", "stl"]
    };

    endpoint = "/openapi/v2/text-to-3d";
  }

  const meshyResponse = await meshyFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const taskId = meshyResponse.result || meshyResponse.id || null;
  if (taskId) {
    meshyTaskContexts.set(taskId, {
      provider: "meshy",
      mode,
      modelVersion,
      textureQuality,
      geometryQuality,
      auxiliaryPrompt
    });
  }

  const responseBody = {
    ok: true,
    provider: "meshy",
    providerName: "Meshy",
    mode,
    taskId,
    displayModelVersion: modelVersion,
    payload,
    raw: meshyResponse
  };

  recordGeneratedTask(responseBody, {
    provider: "meshy",
    providerName: "Meshy",
    mode,
    prompt,
    modelVersion
  });
  sendJson(res, 200, responseBody);
}

async function handleMeshyTaskQuery(res, taskId) {
  ensureProviderEnabled("meshy");

  const context = meshyTaskContexts.get(taskId) || null;
  const task = await fetchMeshyTask(taskId, context?.mode);
  const normalized = normalizeMeshyTask(task, context, taskId);

  if (task.type === "text-to-3d-preview" && task.status === "SUCCEEDED") {
    const refineTaskId = await ensureMeshyRefineTask(task.id || taskId, context);
    sendJson(res, 200, {
      ...normalized,
      finalized: false,
      progress: 100,
      status: "running",
      statusText: "预览阶段完成，正在进入贴图阶段...",
      stageText: "Meshy 贴图阶段",
      transition: {
        nextTaskId: refineTaskId,
        stageText: "Meshy 贴图阶段",
        statusText: "预览阶段完成，正在进入贴图阶段..."
      }
    });
    return;
  }

  recordGeneratedTask(normalized, { provider: "meshy", taskId });
  sendJson(res, 200, normalized);
}

async function handleModelOptimize(res, form) {
  const provider = normalizeProvider(form.get("provider"));
  const operation = normalizeOptimizationOperation(form.get("operation"));

  if (provider === "meshy" && operation === "retexture") {
    await handleMeshyRetexture(res, form);
    return;
  }

  const error = new Error(buildUnsupportedOptimizationMessage(provider, operation));
  error.status = 400;
  error.details = {
    provider,
    operation,
    support: buildOptimizationConfigMap().providers?.[provider]?.operations?.[operation] || null
  };
  throw error;
}

async function handleModelOptimizeTaskQuery(res, taskId, provider, operation) {
  if (provider === "meshy" && operation === "retexture") {
    await handleMeshyRetextureTaskQuery(res, taskId);
    return;
  }

  const error = new Error(buildUnsupportedOptimizationMessage(provider, operation));
  error.status = 400;
  error.details = {
    provider,
    operation,
    taskId
  };
  throw error;
}

async function handleMeshyRetexture(res, form) {
  ensureProviderEnabled("meshy");

  const modelVersion = String(form.get("modelVersion") || "latest");
  const modelUrl = normalizeText(form.get("modelUrl"));
  const modelFile = form.get("modelFile");
  const texturePrompt = normalizeText(form.get("texturePrompt"));
  const styleImage = form.get("styleImage");
  const target = normalizeText(form.get("target")) || "preview";
  const saveMode = normalizeText(form.get("saveMode")) || "new_revision";
  const preserveUv = parseBoolean(form.get("preserveUv"), true);
  const enablePbr = parseBoolean(form.get("enablePbr"), true);
  const removeLighting = parseBoolean(form.get("removeLighting"), true);

  let sourceUrl = modelUrl;
  if (!(sourceUrl && isHttpUrl(sourceUrl))) {
    sourceUrl = "";
  }

  if (!sourceUrl) {
    if (!(modelFile instanceof File) || modelFile.size === 0) {
      const error = new Error("Retexture requires a model file or a valid model URL.");
      error.status = 400;
      throw error;
    }

    sourceUrl = await fileToDataUri(modelFile, getMimeTypeForModelFile(modelFile));
  }

  const payload = {
    model_url: sourceUrl,
    ai_model: modelVersion,
    enable_original_uv: preserveUv,
    enable_pbr: enablePbr,
    remove_lighting: removeLighting
  };

  if (texturePrompt) {
    payload.text_style_prompt = texturePrompt;
  }

  if (styleImage instanceof File && styleImage.size > 0) {
    payload.image_url = await fileToDataUri(styleImage);
  }

  const meshyResponse = await meshyFetch("/openapi/v1/retexture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const taskId = meshyResponse.result || meshyResponse.id || null;
  if (taskId) {
    optimizationTaskContexts.set(taskId, {
      provider: "meshy",
      operation: "retexture",
      modelVersion,
      target,
      saveMode
    });
  }

  sendJson(res, 200, {
    ok: true,
    provider: "meshy",
    providerName: "Meshy",
    operation: "retexture",
    taskId,
    displayModelVersion: modelVersion,
    target,
    saveMode,
    payload,
    raw: meshyResponse
  });
}

async function handleMeshyRetextureTaskQuery(res, taskId) {
  ensureProviderEnabled("meshy");

  const context = optimizationTaskContexts.get(taskId) || null;
  const task = await meshyFetch(`/openapi/v1/retexture/${taskId}`, { method: "GET" });

  sendJson(res, 200, normalizeMeshyRetextureTask(task, context, taskId));
}

function normalizeMeshyRetextureTask(task, context, fallbackTaskId) {
  const rawUrls = task.model_urls || {};
  const normalizedStatus = normalizeMeshyStatus(task.status);
  const taskId = task.id || fallbackTaskId;

  return {
    ok: true,
    provider: "meshy",
    providerName: "Meshy",
    operation: "retexture",
    taskId,
    type: task.type || "retexture",
    status: normalizedStatus,
    statusText: task.task_error?.message || normalizedStatus,
    progress: typeof task.progress === "number" ? task.progress : 0,
    finalized: NORMALIZED_FINAL_STATUSES.has(normalizedStatus),
    stageText: "Meshy AI贴图任务",
    displayModelVersion: context?.modelVersion || task.ai_model || "latest",
    input: {
      textStylePrompt: task.text_style_prompt || "",
      imageUrl: task.image_url || "",
      target: context?.target || "preview",
      saveMode: context?.saveMode || "new_revision"
    },
    output: rawUrls,
    renderedImage: task.thumbnail_url || null,
    preferredModelUrl:
      rawUrls.glb ||
      rawUrls.fbx ||
      rawUrls.obj ||
      rawUrls.stl ||
      null,
    modelUrls: {
      glb: rawUrls.glb || null,
      fbx: rawUrls.fbx || null,
      obj: rawUrls.obj || null,
      mtl: rawUrls.mtl || null,
      stl: rawUrls.stl || null
    },
    downloadItems: buildMeshyDownloadItems(rawUrls, task.thumbnail_url),
    raw: task
  };
}

async function ensureMeshyRefineTask(previewTaskId, context) {
  if (meshyRefineTasks.has(previewTaskId)) {
    return meshyRefineTasks.get(previewTaskId);
  }

  const payload = {
    mode: "refine",
    preview_task_id: previewTaskId,
    ai_model: context?.modelVersion || "latest",
    enable_pbr: context?.textureQuality === "detailed"
  };

  if (context?.auxiliaryPrompt) {
    payload.texture_prompt = context.auxiliaryPrompt;
  }

  const response = await meshyFetch("/openapi/v2/text-to-3d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const refineTaskId = response.result || response.id;
  meshyRefineTasks.set(previewTaskId, refineTaskId);
  meshyTaskContexts.set(refineTaskId, {
    ...(context || {}),
    provider: "meshy",
    mode: "text",
    stage: "refine",
    previewTaskId
  });

  return refineTaskId;
}

async function fetchMeshyTask(taskId, preferredMode = "text") {
  const attempts = preferredMode === "image"
    ? [
        { endpoint: `/openapi/v1/image-to-3d/${taskId}` },
        { endpoint: `/openapi/v2/text-to-3d/${taskId}` }
      ]
    : [
        { endpoint: `/openapi/v2/text-to-3d/${taskId}` },
        { endpoint: `/openapi/v1/image-to-3d/${taskId}` }
      ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await meshyFetch(attempt.endpoint, { method: "GET" });
    } catch (error) {
      lastError = error;
      if (error.status && error.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Meshy task not found.");
}

function normalizeMeshyTask(task, context, fallbackTaskId) {
  const rawUrls = task.model_urls || {};
  const normalizedStatus = normalizeMeshyStatus(task.status);
  const taskId = task.id || fallbackTaskId;
  const mode = task.type?.startsWith("image") ? "image" : "text";

  return {
    ok: true,
    provider: "meshy",
    providerName: "Meshy",
    mode,
    taskId,
    type: task.type,
    status: normalizedStatus,
    statusText: task.task_error?.message || normalizedStatus,
    progress: typeof task.progress === "number" ? task.progress : 0,
    finalized: NORMALIZED_FINAL_STATUSES.has(normalizedStatus),
    stageText: inferMeshyStageText(task.type),
    displayModelVersion: context?.modelVersion || task.ai_model || "latest",
    input: {
      prompt: task.prompt || "",
      texturePrompt: task.texture_prompt || ""
    },
    output: rawUrls,
    renderedImage: task.thumbnail_url || null,
    preferredModelUrl:
      rawUrls.glb ||
      rawUrls.pre_remeshed_glb ||
      rawUrls.fbx ||
      rawUrls.obj ||
      rawUrls.stl ||
      rawUrls.usdz ||
      null,
    modelUrls: {
      model: rawUrls.glb || null,
      pbrModel: null,
      baseModel: rawUrls.pre_remeshed_glb || null,
      glb: rawUrls.glb || null,
      preRemeshedGlb: rawUrls.pre_remeshed_glb || null,
      fbx: rawUrls.fbx || null,
      obj: rawUrls.obj || null,
      mtl: rawUrls.mtl || null,
      stl: rawUrls.stl || null,
      usdz: rawUrls.usdz || null
    },
    downloadItems: buildMeshyDownloadItems(rawUrls, task.thumbnail_url),
    raw: task
  };
}

async function uploadImageToTripo(file) {
  const formData = new FormData();
  formData.append("file", file, file.name || "input.png");

  const response = await tripoFetch("/upload/sts", {
    method: "POST",
    body: formData
  });

  return {
    ...unwrapTripoData(response),
    raw: response
  };
}

async function tripoFetch(endpoint, options) {
  const response = await fetch(`${TRIPO_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TRIPO_API_KEY}`,
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  return parseHttpJson(response);
}

async function meshyFetch(endpoint, options) {
  const response = await fetch(`${MESHY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  return parseHttpJson(response);
}

async function parseHttpJson(response) {
  const text = await response.text();
  const data = tryParseJson(text);

  if (!response.ok) {
    const error = new Error(
      extractErrorMessage(data) ||
      text ||
      `Request failed with status ${response.status}`
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function proxyRemoteJson(pathname, options = {}) {
  if (!GENERATOR_API_BASE) {
    const error = new Error("GENERATOR_API_BASE is not configured.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(`${GENERATOR_API_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    },
    body: options.body
  });

  return parseHttpJson(response);
}

async function handleAssetProxy(req, res, requestUrl) {
  const rawUrl = String(requestUrl.searchParams.get("url") || "").trim();
  if (!rawUrl) {
    const error = new Error("Missing asset url.");
    error.status = 400;
    throw error;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    const error = new Error("Invalid asset url.");
    error.status = 400;
    throw error;
  }

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    const error = new Error("Only http/https asset urls are supported.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(targetUrl, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: {
      Accept: "*/*",
      ...(req.headers.range ? { Range: req.headers.range } : {})
    }
  });

  if (!response.ok) {
    const details = await safeReadResponseText(response);
    const error = new Error(`Failed to fetch remote asset (${response.status}).`);
    error.status = response.status;
    error.details = details;
    throw error;
  }

  const fileName = path.basename(targetUrl.pathname || "asset");
  const ext = path.extname(fileName).toLowerCase();
  const contentType = response.headers.get("content-type") || inferAssetContentType(ext);
  const contentLength = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const acceptRanges = response.headers.get("accept-ranges");

  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Content-Disposition": `inline; filename="${fileName || "asset"}"`
  };

  if (contentLength) {
    headers["Content-Length"] = contentLength;
  }

  if (contentRange) {
    headers["Content-Range"] = contentRange;
  }

  if (etag) {
    headers["ETag"] = etag;
  }

  if (lastModified) {
    headers["Last-Modified"] = lastModified;
  }

  if (acceptRanges) {
    headers["Accept-Ranges"] = acceptRanges;
  }

  res.writeHead(response.status, headers);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

async function safeReadResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function inferAssetContentType(ext) {
  const map = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".fbx": "application/octet-stream",
    ".obj": "text/plain; charset=utf-8",
    ".stl": "model/stl"
  };
  return map[ext] || "application/octet-stream";
}

async function fileToDataUri(file, mimeTypeOverride = "") {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = mimeTypeOverride || file.type || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function ensureProviderEnabled(provider) {
  if (provider === "meshy" && !MESHY_API_KEY) {
    const error = new Error("MESHY_API_KEY is not configured in the runtime environment.");
    error.status = 500;
    throw error;
  }

  if (provider === "tripo" && !TRIPO_API_KEY) {
    const error = new Error("TRIPO_API_KEY is not configured in the runtime environment.");
    error.status = 500;
    throw error;
  }
}

function normalizeProvider(value) {
  return String(value || "tripo").toLowerCase() === "meshy" ? "meshy" : "tripo";
}

function normalizeOptimizationOperation(value) {
  return String(value || "retexture").toLowerCase() === "split" ? "split" : "retexture";
}

function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function isHttpUrl(value) {
  try {
    const target = new URL(String(value));
    return target.protocol === "http:" || target.protocol === "https:";
  } catch {
    return false;
  }
}

function getMimeTypeForModelFile(file) {
  const ext = path.extname(file.name || "").toLowerCase();
  return inferAssetContentType(ext);
}

function buildUnsupportedOptimizationMessage(provider, operation) {
  if (operation === "split") {
    return `${provider === "tripo" ? "Tripo3D" : "Meshy"} 的 AI拆模型流程已在页面和接口上预留，但当前本地运行时尚未接入公开可用的拆件服务。`;
  }

  if (provider === "tripo") {
    return "Tripo3D 的 AI贴图流程已在页面和接口上预留，但当前本地运行时尚未接入公开开发者端点。";
  }

  return "当前优化能力不可用。";
}

function normalizeMeshyStatus(status) {
  const map = {
    PENDING: "queued",
    IN_PROGRESS: "running",
    SUCCEEDED: "success",
    FAILED: "failed",
    CANCELED: "cancelled",
    CANCELLED: "cancelled",
    EXPIRED: "expired"
  };
  return map[status] || "unknown";
}

function inferTripoMode(type) {
  if (String(type).includes("image")) {
    return "image";
  }
  return "text";
}

function inferMeshyStageText(type) {
  if (type === "text-to-3d-preview") {
    return "Meshy 预览阶段";
  }

  if (type === "text-to-3d-refine") {
    return "Meshy 贴图阶段";
  }

  if (String(type).includes("image")) {
    return "Meshy 图片生成阶段";
  }

  return "Meshy 生成任务";
}

function buildTripoDownloadItems(output) {
  const items = [];
  if (output.model) items.push({ label: "下载模型", url: output.model });
  if (output.pbr_model) items.push({ label: "下载 PBR 模型", url: output.pbr_model });
  if (output.base_model) items.push({ label: "下载 Base 模型", url: output.base_model });
  if (output.rendered_image || output.generated_image) {
    items.push({ label: "下载预览图", url: output.rendered_image || output.generated_image });
  }
  return items;
}

function buildMeshyDownloadItems(modelUrls, thumbnailUrl) {
  const labels = {
    glb: "下载 GLB",
    pre_remeshed_glb: "下载原始 GLB",
    fbx: "下载 FBX",
    obj: "下载 OBJ",
    mtl: "下载 MTL",
    stl: "下载 STL",
    usdz: "下载 USDZ"
  };

  const items = [];
  for (const [key, url] of Object.entries(modelUrls || {})) {
    if (url) {
      items.push({ label: labels[key] || `下载 ${key.toUpperCase()}`, url });
    }
  }

  if (thumbnailUrl) {
    items.push({ label: "下载预览图", url: thumbnailUrl });
  }

  return items;
}

function buildAdminAssetResponse() {
  const tasks = Array.from(generatedTaskRecords.values())
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
      return rightTime - leftTime;
    });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    total: tasks.length,
    tasks
  };
}

function buildAdminClientResponse() {
  const now = Date.now();
  const clients = Array.from(playerClientSessions.values())
    .map((client) => ({
      ...client,
      active: now - (Date.parse(client.lastSeenAt) || 0) <= PLAYER_CLIENT_ACTIVE_MS
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.lastSeenAt || 0) || 0;
      const rightTime = Date.parse(right.lastSeenAt || 0) || 0;
      return rightTime - leftTime;
    });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    activeWindowSeconds: Math.round(PLAYER_CLIENT_ACTIVE_MS / 1000),
    total: clients.length,
    activeTotal: clients.filter((client) => client.active).length,
    clients
  };
}

function buildAdminUserResponse() {
  const users = readAdminUsersFile().users
    .map(toPublicAdminUser)
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.createdAt || 0) || 0;
      return rightTime - leftTime;
    });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    total: users.length,
    users
  };
}

function createAdminUser(payload) {
  const store = readAdminUsersFile();
  const now = new Date().toISOString();
  const username = normalizeAdminUsername(payload?.username);
  const displayName = normalizeText(payload?.displayName || username);
  const role = normalizeAdminRole(payload?.role);
  const disabled = Boolean(payload?.disabled);

  if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throwHttpError(409, "用户名已存在。");
  }

  const user = {
    id: crypto.randomUUID(),
    username,
    displayName,
    role,
    disabled,
    password: buildPasswordRecord(payload?.password),
    createdAt: now,
    updatedAt: now
  };

  store.users.push(user);
  writeAdminUsersFile(store);
  return toPublicAdminUser(user);
}

function updateAdminUser(id, payload) {
  const store = readAdminUsersFile();
  const decodedId = decodeURIComponent(id);
  const index = store.users.findIndex((user) => user.id === decodedId);
  if (index < 0) {
    throwHttpError(404, "用户不存在。");
  }

  const current = store.users[index];
  const nextUsername = payload?.username === undefined
    ? current.username
    : normalizeAdminUsername(payload.username);
  const duplicate = store.users.some((user) => {
    return user.id !== current.id && user.username.toLowerCase() === nextUsername.toLowerCase();
  });
  if (duplicate) {
    throwHttpError(409, "用户名已存在。");
  }

  const next = {
    ...current,
    username: nextUsername,
    displayName: payload?.displayName === undefined
      ? current.displayName
      : normalizeText(payload.displayName || nextUsername),
    role: payload?.role === undefined ? current.role : normalizeAdminRole(payload.role),
    disabled: payload?.disabled === undefined ? current.disabled : Boolean(payload.disabled),
    updatedAt: new Date().toISOString()
  };

  if (payload?.password) {
    next.password = buildPasswordRecord(payload.password);
  }

  assertAtLeastOneActiveAdmin(store.users, next);
  store.users[index] = next;
  writeAdminUsersFile(store);
  return toPublicAdminUser(next);
}

function deleteAdminUser(id) {
  const store = readAdminUsersFile();
  const decodedId = decodeURIComponent(id);
  const index = store.users.findIndex((user) => user.id === decodedId);
  if (index < 0) {
    throwHttpError(404, "用户不存在。");
  }

  const nextUsers = store.users.filter((user) => user.id !== decodedId);
  assertAtLeastOneActiveAdmin(nextUsers);
  writeAdminUsersFile({ users: nextUsers });
}

function assertAtLeastOneActiveAdmin(users, replacement) {
  const nextUsers = replacement
    ? users.map((user) => user.id === replacement.id ? replacement : user)
    : users;
  const hasActiveAdmin = nextUsers.some((user) => user.role === "admin" && !user.disabled);
  if (!hasActiveAdmin) {
    throwHttpError(400, "至少需要保留一个启用状态的管理员。");
  }
}

function readAdminUsersFile() {
  const fallback = {
    users: [createDefaultAdminUser()]
  };

  if (!fs.existsSync(adminUsersPath)) {
    return fallback;
  }

  try {
    const data = JSON.parse(fs.readFileSync(adminUsersPath, "utf8"));
    const users = Array.isArray(data?.users) ? data.users : [];
    const normalizedUsers = users
      .map(normalizeStoredAdminUser)
      .filter(Boolean);
    return {
      users: normalizedUsers.length ? normalizedUsers : fallback.users
    };
  } catch {
    return fallback;
  }
}

function writeAdminUsersFile(store) {
  const payload = {
    users: store.users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      disabled: Boolean(user.disabled),
      password: user.password || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }))
  };

  fs.writeFileSync(adminUsersPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function createDefaultAdminUser() {
  const now = new Date().toISOString();
  return {
    id: "admin",
    username: "admin",
    displayName: "管理员",
    role: "admin",
    disabled: false,
    password: null,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeStoredAdminUser(user) {
  const username = normalizeText(user?.username);
  if (!username) {
    return null;
  }

  return {
    id: normalizeText(user?.id) || crypto.randomUUID(),
    username,
    displayName: normalizeText(user?.displayName || username),
    role: normalizeAdminRole(user?.role, "user"),
    disabled: Boolean(user?.disabled),
    password: user?.password && typeof user.password === "object" ? user.password : null,
    createdAt: normalizeText(user?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeText(user?.updatedAt) || normalizeText(user?.createdAt) || new Date().toISOString()
  };
}

function normalizeAdminUsername(value) {
  const username = normalizeText(value);
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
    throwHttpError(400, "用户名需为 2-32 位字母、数字、下划线、点或短横线。");
  }
  return username;
}

function normalizeAdminRole(value, fallback = "user") {
  const role = normalizeText(value || fallback).toLowerCase();
  if (role !== "admin" && role !== "user") {
    throwHttpError(400, "用户角色只能是管理员或普通用户。");
  }
  return role;
}

function buildPasswordRecord(password) {
  const value = String(password || "");
  if (!value) {
    return null;
  }

  if (value.length < 6) {
    throwHttpError(400, "密码长度至少 6 位。");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return {
    algorithm: "scrypt",
    salt,
    hash
  };
}

function toPublicAdminUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleText: user.role === "admin" ? "管理员" : "普通用户",
    disabled: Boolean(user.disabled),
    statusText: user.disabled ? "已禁用" : "已启用",
    hasPassword: Boolean(user.password?.hash),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function throwHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function recordGeneratedTask(task, fallback = {}) {
  const taskId = normalizeText(task?.taskId || task?.id || fallback.taskId);
  if (!taskId) {
    return null;
  }

  const existing = generatedTaskRecords.get(taskId) || {};
  const now = new Date().toISOString();
  const provider = normalizeProvider(task?.provider || fallback.provider || existing.provider);
  const providerName = task?.providerName || fallback.providerName || existing.providerName || (provider === "meshy" ? "Meshy" : "Tripo3D");
  const mode = normalizeText(task?.mode || fallback.mode || existing.mode || "text");
  const input = task?.input && typeof task.input === "object" ? task.input : {};
  const output = task?.output && typeof task.output === "object" ? task.output : existing.output || null;
  const modelUrls = task?.modelUrls && typeof task.modelUrls === "object" ? task.modelUrls : existing.modelUrls || null;
  const downloadItems = Array.isArray(task?.downloadItems) ? task.downloadItems : buildDownloadItemsFromTask(task, modelUrls);
  const prompt = normalizeText(fallback.prompt || input.prompt || existing.prompt || task?.payload?.prompt || "");
  const preferredModelUrl = normalizeText(task?.preferredModelUrl || existing.preferredModelUrl || "");

  const nextRecord = {
    id: taskId,
    taskId,
    provider,
    providerName,
    mode,
    prompt,
    displayModelVersion: normalizeText(task?.displayModelVersion || fallback.modelVersion || existing.displayModelVersion || ""),
    status: normalizeText(task?.status || existing.status || "queued"),
    statusText: normalizeText(task?.statusText || existing.statusText || task?.status || "queued"),
    stageText: normalizeText(task?.stageText || existing.stageText || ""),
    progress: typeof task?.progress === "number" ? task.progress : Number(existing.progress || 0),
    finalized: Boolean(task?.finalized ?? existing.finalized ?? false),
    preferredModelUrl,
    renderedImage: normalizeText(task?.renderedImage || existing.renderedImage || ""),
    modelUrls,
    output,
    downloadItems,
    proxied: Boolean(task?.proxied || existing.proxied),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  generatedTaskRecords.set(taskId, nextRecord);
  return nextRecord;
}

function buildDownloadItemsFromTask(task, modelUrls) {
  if (Array.isArray(task?.downloadItems)) {
    return task.downloadItems;
  }

  const items = [];
  const preferredModelUrl = normalizeText(task?.preferredModelUrl);
  if (preferredModelUrl) {
    items.push({ label: "下载模型", url: preferredModelUrl });
  }

  for (const [key, url] of Object.entries(modelUrls || {})) {
    if (url && !items.some((item) => item.url === url)) {
      items.push({ label: `下载 ${key}`, url });
    }
  }

  if (task?.renderedImage) {
    items.push({ label: "下载预览图", url: task.renderedImage });
  }

  return items;
}

function upsertPlayerClientSession(payload, req) {
  const sessionId = normalizeText(payload?.sessionId) || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const existing = playerClientSessions.get(sessionId) || {};
  const now = new Date().toISOString();
  const client = {
    sessionId,
    active: payload?.event === "close" ? false : true,
    path: normalizeText(payload?.path || existing.path || "/model-preview.html"),
    title: normalizeText(payload?.title || existing.title || "3D 模型播放器"),
    userAgent: normalizeText(payload?.userAgent || existing.userAgent || req.headers["user-agent"] || ""),
    language: normalizeText(payload?.language || existing.language || ""),
    platform: normalizeText(payload?.platform || existing.platform || ""),
    timezone: normalizeText(payload?.timezone || existing.timezone || ""),
    viewport: sanitizeClientSize(payload?.viewport || existing.viewport),
    screen: sanitizeClientSize(payload?.screen || existing.screen),
    referrer: normalizeText(payload?.referrer || existing.referrer || ""),
    ip: getClientIp(req),
    firstSeenAt: existing.firstSeenAt || now,
    lastSeenAt: now
  };

  playerClientSessions.set(sessionId, client);
  return client;
}

function sanitizeClientSize(value) {
  if (!value || typeof value !== "object") {
    return { width: 0, height: 0 };
  }

  return {
    width: Number(value.width || 0),
    height: Number(value.height || 0)
  };
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.socket?.remoteAddress || "";
}

function buildLocalGeneratorConfigResponse() {
  const providers = buildProviderConfigMap();
  const generatorSettings = getGeneratorSettings(providers);
  const optimization = buildOptimizationConfigMap();

  return {
    ok: true,
    generatorApiBase: "",
    proxied: false,
    providers,
    generatorSettings,
    optimization
  };
}

function buildProviderConfigMap() {
  const useRemoteGenerator = Boolean(GENERATOR_API_BASE);
  return {
    tripo: {
      enabled: useRemoteGenerator || Boolean(TRIPO_API_KEY),
      name: GENERATOR_PROVIDER_OPTIONS.tripo.name,
      defaultModelVersion: GENERATOR_PROVIDER_OPTIONS.tripo.defaultModelVersion,
      modelVersions: GENERATOR_PROVIDER_OPTIONS.tripo.modelVersions
    },
    meshy: {
      enabled: useRemoteGenerator || Boolean(MESHY_API_KEY),
      name: GENERATOR_PROVIDER_OPTIONS.meshy.name,
      defaultModelVersion: GENERATOR_PROVIDER_OPTIONS.meshy.defaultModelVersion,
      modelVersions: GENERATOR_PROVIDER_OPTIONS.meshy.modelVersions
    }
  };
}

function buildOptimizationConfigMap() {
  return {
    providers: {
      tripo: {
        enabled: Boolean(TRIPO_API_KEY),
        name: OPTIMIZATION_PROVIDER_OPTIONS.tripo.name,
        defaultModelVersion: OPTIMIZATION_PROVIDER_OPTIONS.tripo.defaultModelVersion,
        modelVersions: OPTIMIZATION_PROVIDER_OPTIONS.tripo.modelVersions,
        operations: {
          retexture: {
            enabled: false
          },
          split: {
            enabled: false
          }
        }
      },
      meshy: {
        enabled: Boolean(MESHY_API_KEY),
        name: OPTIMIZATION_PROVIDER_OPTIONS.meshy.name,
        defaultModelVersion: OPTIMIZATION_PROVIDER_OPTIONS.meshy.defaultModelVersion,
        modelVersions: OPTIMIZATION_PROVIDER_OPTIONS.meshy.modelVersions,
        operations: {
          retexture: {
            enabled: Boolean(MESHY_API_KEY)
          },
          split: {
            enabled: false
          }
        }
      }
    }
  };
}

function getGeneratorSettings(providers = buildProviderConfigMap()) {
  const stored = readGeneratorSettingsFile();
  const availableProvider = selectDefaultProvider(providers);
  const fallbackProvider = providers[availableProvider] ? availableProvider : "tripo";
  const requestedProvider = normalizeProvider(stored.provider || fallbackProvider);
  const provider = providers[requestedProvider]?.enabled ? requestedProvider : fallbackProvider;
  const modelVersion = resolveModelVersion(provider, stored.modelVersion, providers);

  return {
    provider,
    providerName: providers[provider]?.name || provider,
    modelVersion
  };
}

function saveGeneratorSettings(payload) {
  const providers = buildProviderConfigMap();
  const provider = normalizeProvider(payload?.provider);

  if (!providers[provider]?.enabled) {
    const error = new Error("Selected provider is not enabled in the current runtime environment.");
    error.status = 400;
    throw error;
  }

  const modelVersion = resolveModelVersion(provider, payload?.modelVersion, providers, true);
  const nextSettings = {
    provider,
    modelVersion
  };

  fs.writeFileSync(generatorSettingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");

  return {
    ...nextSettings,
    providerName: providers[provider]?.name || provider
  };
}

function readGeneratorSettingsFile() {
  if (!fs.existsSync(generatorSettingsPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(generatorSettingsPath, "utf8"));
  } catch {
    return {};
  }
}

function selectDefaultProvider(providers) {
  if (providers.meshy?.enabled) {
    return "meshy";
  }

  if (providers.tripo?.enabled) {
    return "tripo";
  }

  return "tripo";
}

function resolveModelVersion(provider, requestedValue, providers = buildProviderConfigMap(), strict = false) {
  const modelVersions = providers[provider]?.modelVersions || [];
  const allowedValues = new Set(modelVersions.map((item) => item.value));
  const defaultValue = providers[provider]?.defaultModelVersion || GENERATOR_PROVIDER_OPTIONS[provider]?.defaultModelVersion || "";
  const requestedModelVersion = String(requestedValue || "").trim();

  if (requestedModelVersion && allowedValues.has(requestedModelVersion)) {
    return requestedModelVersion;
  }

  if (strict && requestedModelVersion) {
    const error = new Error("Selected model version is not supported for the current provider.");
    error.status = 400;
    throw error;
  }

  return defaultValue;
}

async function handleStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed");
    return;
  }

  let targetPath = pathname === "/" ? "/index.html" : pathname;
  targetPath = decodeURIComponent(targetPath);

  const normalizedPath = path
    .normalize(targetPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const fileBuffer = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end(req.method === "HEAD" ? undefined : fileBuffer);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

function toWebRequest(req, requestUrl) {
  return new Request(requestUrl.toString(), {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half"
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function unwrapTripoData(data) {
  if (data && typeof data === "object" && data.data && typeof data.data === "object") {
    return data.data;
  }

  return data;
}

function extractErrorMessage(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (data.error && typeof data.error.message === "string" && data.error.message.trim()) {
    return data.error.message;
  }

  if (data.task_error && typeof data.task_error.message === "string" && data.task_error.message.trim()) {
    return data.task_error.message;
  }

  if (typeof data.raw === "string" && data.raw.trim()) {
    return data.raw;
  }

  return "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function mapMimeToTripoFileType(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpeg";
}

function supportsTextureQuality(modelVersion) {
  return [
    "P1-20260311",
    "v3.1-20260211",
    "v3.0-20250812",
    "v2.5-20250123",
    "v2.0-20240919"
  ].includes(modelVersion);
}

function supportsGeometryQuality(modelVersion) {
  return ["v3.1-20260211", "v3.0-20250812"].includes(modelVersion);
}

function supportsOrientation(modelVersion) {
  return [
    "P1-20260311",
    "v3.1-20260211",
    "v3.0-20250812",
    "v2.5-20250123",
    "v2.0-20240919"
  ].includes(modelVersion);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
