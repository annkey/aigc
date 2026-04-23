const form = document.getElementById("generator-form");
const submitButton = document.getElementById("submit-button");
const imageInput = document.getElementById("image");
const imagePreview = document.getElementById("image-preview");
const textFields = document.getElementById("text-fields");
const imageFields = document.getElementById("image-fields");
const modeOptions = Array.from(document.querySelectorAll('.mode-option input[name="mode"]'));
const providerOptions = Array.from(document.querySelectorAll('.provider-option input[name="provider"]'));
const providerBadge = document.getElementById("provider-badge");
const modelVersionBadge = document.getElementById("model-version-badge");
const platformDescription = document.getElementById("platform-description");
const modelVersionLabel = document.getElementById("model-version-label");
const textureQualityLabel = document.getElementById("texture-quality-label");
const geometryQualityLabel = document.getElementById("geometry-quality-label");
const secondaryTextLabel = document.getElementById("secondary-text-label");
const imageHelpText = document.getElementById("image-help-text");
const modelVersionSelect = document.getElementById("modelVersion");
const textureQualitySelect = document.getElementById("textureQuality");
const geometryQualitySelect = document.getElementById("geometryQuality");
const negativePromptInput = document.getElementById("negativePrompt");
const workspaceOptions = Array.from(document.querySelectorAll('.workspace-option input[name="workspace"]'));
const generatorWorkspace = document.getElementById("generator-workspace");
const optimizerWorkspace = document.getElementById("optimizer-workspace");

const optimizerForm = document.getElementById("optimizer-form");
const optimizerSubmitButton = document.getElementById("optimizer-submit-button");
const optimizerCapabilityNote = document.getElementById("optimizer-capability-note");
const optimizerProviderOptions = Array.from(document.querySelectorAll('.optimizer-provider-option input[name="optimizerProvider"]'));
const optimizerOperationOptions = Array.from(document.querySelectorAll('.optimizer-operation-option input[name="optimizerOperation"]'));
const textureFields = document.getElementById("optimizer-texture-fields");
const splitFields = document.getElementById("optimizer-split-fields");
const modelFileInput = document.getElementById("modelFile");
const modelUrlInput = document.getElementById("modelUrl");
const optimizerModelVersionSelect = document.getElementById("optimizerModelVersion");
const optimizerTargetSelect = document.getElementById("optimizerTarget");
const optimizerSaveModeSelect = document.getElementById("optimizerSaveMode");
const texturePromptInput = document.getElementById("texturePrompt");
const styleImageInput = document.getElementById("styleImage");
const styleImagePreview = document.getElementById("style-image-preview");
const preserveUvInput = document.getElementById("preserveUv");
const enablePbrInput = document.getElementById("enablePbr");
const removeLightingInput = document.getElementById("removeLighting");
const splitPromptInput = document.getElementById("splitPrompt");
const splitStrategyInput = document.getElementById("splitStrategy");

const PROVIDER_CONFIG = {
  tripo: {
    name: "Tripo3D",
    description: "选择一种输入方式，提交到 Tripo3D。",
    modelVersionLabel: "模型版本",
    textureQualityLabel: "纹理质量",
    geometryQualityLabel: "几何质量",
    secondaryTextLabel: "负向提示词",
    secondaryTextPlaceholder: "例如：模糊、破损、背景杂乱",
    imageAccept: "image/png,image/jpeg,image/webp",
    imageHelpText: "支持 PNG / JPEG / WEBP，建议分辨率大于 256px",
    modelVersions: [
      { value: "P1-20260311", label: "P1-20260311" },
      { value: "v3.1-20260211", label: "v3.1-20260211" },
      { value: "v2.5-20250123", label: "v2.5-20250123" }
    ],
    textureOptions: [
      { value: "standard", label: "standard" },
      { value: "detailed", label: "detailed" }
    ],
    geometryOptions: [
      { value: "standard", label: "standard" },
      { value: "detailed", label: "detailed" }
    ],
    defaultModelVersion: "P1-20260311",
    defaultTextureQuality: "standard",
    defaultGeometryQuality: "standard"
  },
  meshy: {
    name: "Meshy",
    description: "选择一种输入方式，提交到 Meshy。",
    modelVersionLabel: "AI 模型",
    textureQualityLabel: "贴图输出",
    geometryQualityLabel: "网格类型",
    secondaryTextLabel: "贴图补充提示词",
    secondaryTextPlaceholder: "例如：金属表面、做旧痕迹、发光细节",
    imageAccept: "image/png,image/jpeg",
    imageHelpText: "支持 PNG / JPEG，建议主体清晰、背景干净",
    modelVersions: [
      { value: "latest", label: "latest (Meshy 6)" },
      { value: "meshy-6", label: "meshy-6" },
      { value: "meshy-5", label: "meshy-5" }
    ],
    textureOptions: [
      { value: "standard", label: "基础贴图" },
      { value: "detailed", label: "PBR 贴图" }
    ],
    geometryOptions: [
      { value: "standard", label: "standard" },
      { value: "lowpoly", label: "lowpoly" }
    ],
    defaultModelVersion: "latest",
    defaultTextureQuality: "standard",
    defaultGeometryQuality: "standard"
  }
};

const OPTIMIZER_PROVIDER_CONFIG = {
  meshy: {
    name: "Meshy",
    operationNotes: {
      retexture: "当前默认接入 Meshy 的公开 Retexture API，适合已有模型重新贴图。",
      split: "当前页面已预留 AI 拆模型流程；本地默认环境未内置公开拆件 API，如接入远程优化服务后可直接打通。"
    }
  },
  tripo: {
    name: "Tripo3D",
    operationNotes: {
      retexture: "Tripo 官方公开展示了 AI Texturing 能力，但当前本地版本未直接接入公开开发者端点。",
      split: "Tripo 官方公开展示了 Intelligent Segmentation 能力；如果后端接入远程优化服务，本页面可直接承接拆模型流程。"
    }
  }
};

let runtimeConfig = null;
let activeGeneratorPoller = null;
let activeOptimizerPoller = null;
let currentTaskContext = null;
let currentOptimizationContext = null;

const generatorResult = createResultController({
  statusCard: document.getElementById("status-card"),
  statusText: document.getElementById("status-text"),
  progressText: document.getElementById("progress-text"),
  progressFill: document.getElementById("progress-fill"),
  taskMeta: document.getElementById("task-meta"),
  previewWrap: document.getElementById("preview-wrap"),
  viewerWrap: document.getElementById("viewer-wrap"),
  renderWrap: document.getElementById("render-wrap"),
  modelViewer: document.getElementById("model-viewer"),
  renderImage: document.getElementById("render-image"),
  downloadLinks: document.getElementById("download-links"),
  resultJson: document.getElementById("result-json")
});

const optimizerResult = createResultController({
  statusCard: document.getElementById("optimizer-status-card"),
  statusText: document.getElementById("optimizer-status-text"),
  progressText: document.getElementById("optimizer-progress-text"),
  progressFill: document.getElementById("optimizer-progress-fill"),
  taskMeta: document.getElementById("optimizer-task-meta"),
  previewWrap: document.getElementById("optimizer-preview-wrap"),
  viewerWrap: document.getElementById("optimizer-viewer-wrap"),
  renderWrap: document.getElementById("optimizer-render-wrap"),
  modelViewer: document.getElementById("optimizer-model-viewer"),
  renderImage: document.getElementById("optimizer-render-image"),
  downloadLinks: document.getElementById("optimizer-download-links"),
  resultJson: document.getElementById("optimizer-result-json")
});

bootstrap();

async function bootstrap() {
  bindWorkspaceSwitch();
  bindProviderSwitch();
  bindModeSwitch();
  bindImagePreview();
  bindModelViewer(generatorResult.modelViewer, generatorResult.viewerWrap, generatorResult.previewWrap);

  bindOptimizerSwitches();
  bindOptimizerPreview();
  bindModelViewer(optimizerResult.modelViewer, optimizerResult.viewerWrap, optimizerResult.previewWrap);

  modelVersionSelect.addEventListener("change", updateHeroBadges);

  try {
    runtimeConfig = await fetchJson("/api/config");
  } catch {
    runtimeConfig = null;
    generatorResult.setStatus("服务启动异常，请检查后端配置。", 0, "error");
  }

  applyProviderConfig(getCurrentProvider(), runtimeConfig);
  applyOptimizerState(runtimeConfig);

  form.addEventListener("submit", handleGeneratorSubmit);
  optimizerForm.addEventListener("submit", handleOptimizerSubmit);
}

function createResultController(elements) {
  return {
    ...elements,
    setStatus(text, progress, tone) {
      elements.statusText.textContent = formatStatus(text);
      elements.progressText.textContent = `${Math.max(0, Math.min(100, Math.round(progress)))}%`;
      elements.progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      elements.statusCard.className = `status-card ${tone || "idle"}`;
    },
    renderTaskMeta(taskId, context, stageText = "") {
      elements.taskMeta.innerHTML = "";
      elements.taskMeta.append(
        createPill(`Task ID: ${taskId}`),
        createPill(`Provider: ${context.providerName}`),
        createPill(`Operation: ${context.operationLabel || context.mode}`),
        createPill(`Model: ${context.modelVersion || "-"}`)
      );

      if (stageText) {
        elements.taskMeta.append(createPill(stageText));
      }

      elements.taskMeta.classList.remove("hidden");
    },
    renderTask(task) {
      elements.resultJson.textContent = JSON.stringify(task.raw, null, 2);
      elements.resultJson.classList.remove("hidden");

      const modelUrl = getPreviewModelUrl(task);
      const renderedImageUrl = task.renderedImage;

      elements.previewWrap.classList.add("hidden");
      elements.viewerWrap.classList.add("hidden");
      elements.renderWrap.classList.add("hidden");

      if (modelUrl) {
        elements.modelViewer.src = modelUrl;
        elements.viewerWrap.classList.remove("hidden");
        elements.previewWrap.classList.remove("hidden");
      } else {
        elements.modelViewer.removeAttribute("src");
      }

      if (renderedImageUrl) {
        elements.renderImage.src = renderedImageUrl;
        elements.renderWrap.classList.remove("hidden");
        elements.previewWrap.classList.remove("hidden");
      } else {
        elements.renderImage.removeAttribute("src");
      }

      const links = [];
      for (const item of task.downloadItems || []) {
        if (item?.url) {
          links.push(linkMarkup(item.label, item.url));
        }
      }

      if (links.length > 0) {
        elements.downloadLinks.innerHTML = links.join("");
        elements.downloadLinks.classList.remove("hidden");
      } else {
        elements.downloadLinks.innerHTML = "";
        elements.downloadLinks.classList.add("hidden");
      }
    },
    reset() {
      elements.taskMeta.innerHTML = "";
      elements.taskMeta.classList.add("hidden");
      elements.previewWrap.classList.add("hidden");
      elements.viewerWrap.classList.add("hidden");
      elements.renderWrap.classList.add("hidden");
      elements.downloadLinks.innerHTML = "";
      elements.downloadLinks.classList.add("hidden");
      elements.resultJson.textContent = "";
      elements.resultJson.classList.add("hidden");
      elements.modelViewer.removeAttribute("src");
      elements.renderImage.removeAttribute("src");
    }
  };
}

function bindWorkspaceSwitch() {
  for (const input of workspaceOptions) {
    input.addEventListener("change", () => {
      updateOptionVisuals();
      const workspace = getCurrentWorkspace();
      generatorWorkspace.classList.toggle("hidden", workspace !== "generator");
      optimizerWorkspace.classList.toggle("hidden", workspace !== "optimizer");
    });
  }
}

function bindProviderSwitch() {
  for (const input of providerOptions) {
    input.addEventListener("change", async () => {
      updateOptionVisuals();
      generatorResult.reset();
      clearGeneratorPoller();
      currentTaskContext = null;
      generatorResult.setStatus("等待提交", 0, "idle");

      try {
        runtimeConfig = await fetchJson("/api/config");
      } catch {
        runtimeConfig = runtimeConfig || null;
      }

      applyProviderConfig(getCurrentProvider(), runtimeConfig);
      applyOptimizerState(runtimeConfig);
    });
  }
}

function bindModeSwitch() {
  for (const input of modeOptions) {
    input.addEventListener("change", () => {
      updateOptionVisuals();
      const mode = getCurrentMode();
      textFields.classList.toggle("hidden", mode !== "text");
      imageFields.classList.toggle("hidden", mode !== "image");
    });
  }
}

function bindImagePreview() {
  imageInput.addEventListener("change", () => renderImagePreview(imageInput, imagePreview));
}

function bindOptimizerPreview() {
  styleImageInput.addEventListener("change", () => renderImagePreview(styleImageInput, styleImagePreview));
}

function bindOptimizerSwitches() {
  for (const input of optimizerProviderOptions) {
    input.addEventListener("change", () => {
      updateOptionVisuals();
      applyOptimizerState(runtimeConfig);
    });
  }

  for (const input of optimizerOperationOptions) {
    input.addEventListener("change", () => {
      updateOptionVisuals();
      applyOptimizerState(runtimeConfig);
    });
  }
}

function bindModelViewer(modelViewer, viewerWrap, previewWrap) {
  modelViewer.addEventListener("load", () => {
    viewerWrap.classList.remove("hidden");
    previewWrap.classList.remove("hidden");
  });

  modelViewer.addEventListener("error", () => {
    viewerWrap.classList.add("hidden");
  });
}

function renderImagePreview(input, container) {
  const file = input.files?.[0];
  if (!file) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  const url = URL.createObjectURL(file);
  container.innerHTML = `<img src="${url}" alt="上传预览图">`;
  container.classList.remove("hidden");
}

function applyProviderConfig(provider, config = null) {
  const providerConfig = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.tripo;
  const apiConfig = config?.providers?.[provider] || {};

  platformDescription.textContent = providerConfig.description;
  providerBadge.textContent = providerConfig.name;
  modelVersionLabel.textContent = providerConfig.modelVersionLabel;
  textureQualityLabel.textContent = providerConfig.textureQualityLabel;
  geometryQualityLabel.textContent = providerConfig.geometryQualityLabel;
  secondaryTextLabel.textContent = providerConfig.secondaryTextLabel;
  negativePromptInput.placeholder = providerConfig.secondaryTextPlaceholder;
  imageInput.accept = providerConfig.imageAccept;
  imageHelpText.textContent = providerConfig.imageHelpText;

  fillSelect(
    modelVersionSelect,
    providerConfig.modelVersions,
    apiConfig.defaultModelVersion || providerConfig.defaultModelVersion
  );
  fillSelect(textureQualitySelect, providerConfig.textureOptions, providerConfig.defaultTextureQuality);
  fillSelect(geometryQualitySelect, providerConfig.geometryOptions, providerConfig.defaultGeometryQuality);

  updateHeroBadges();
  updateOptionVisuals();
}

function applyOptimizerState(config = null) {
  const provider = getCurrentOptimizerProvider();
  const operation = getCurrentOptimizerOperation();
  const providerConfig = OPTIMIZER_PROVIDER_CONFIG[provider] || OPTIMIZER_PROVIDER_CONFIG.meshy;
  const capability = config?.optimization?.providers?.[provider]?.operations?.[operation];
  const modelVersionOptions = config?.optimization?.providers?.[provider]?.modelVersions
    || PROVIDER_CONFIG[provider]?.modelVersions
    || PROVIDER_CONFIG.meshy.modelVersions;

  textureFields.classList.toggle("hidden", operation !== "retexture");
  splitFields.classList.toggle("hidden", operation !== "split");

  const noteSuffix = capability?.enabled
    ? "当前环境可直接提交。"
    : "当前环境会给出明确提示，不会静默失败。";
  optimizerCapabilityNote.textContent = `${providerConfig.operationNotes[operation]} ${noteSuffix}`;

  optimizerSubmitButton.textContent = operation === "retexture" ? "开始 AI 贴图" : "开始 AI 拆模型";
  fillOptimizerModelVersion(modelVersionOptions, provider);
}

function fillOptimizerModelVersion(modelVersions, provider) {
  const activeProviderConfig = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.meshy;
  fillSelect(
    optimizerModelVersionSelect,
    modelVersions,
    optimizerModelVersionSelect.value || activeProviderConfig.defaultModelVersion
  );
}

function fillSelect(select, options, selectedValue) {
  const currentValue = selectedValue || select.value;
  select.innerHTML = "";

  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    if (option.value === currentValue) {
      element.selected = true;
    }
    select.appendChild(element);
  }

  if (!select.value && options.length > 0) {
    select.value = options[0].value;
  }
}

function updateHeroBadges() {
  const provider = getCurrentProvider();
  const providerConfig = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.tripo;
  providerBadge.textContent = providerConfig.name;
  modelVersionBadge.textContent = modelVersionSelect.selectedOptions[0]?.textContent || modelVersionSelect.value;
}

function updateOptionVisuals() {
  const labels = document.querySelectorAll(".mode-option");
  for (const label of labels) {
    const input = label.querySelector("input");
    label.classList.toggle("active", input.checked);
  }
}

async function handleGeneratorSubmit(event) {
  event.preventDefault();

  const provider = getCurrentProvider();
  const providerConfig = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.tripo;
  const mode = getCurrentMode();
  const payload = new FormData();
  payload.append("provider", provider);
  payload.append("mode", mode);
  payload.append("modelVersion", modelVersionSelect.value);
  payload.append("textureQuality", textureQualitySelect.value);
  payload.append("geometryQuality", geometryQualitySelect.value);

  if (mode === "text") {
    const prompt = document.getElementById("prompt").value.trim();
    const secondaryText = negativePromptInput.value.trim();

    if (!prompt) {
      generatorResult.setStatus("请输入文本提示词。", 0, "error");
      return;
    }

    payload.append("prompt", prompt);
    payload.append("negativePrompt", secondaryText);
  } else {
    const file = imageInput.files?.[0];
    if (!file) {
      generatorResult.setStatus("请先上传一张参考图片。", 0, "error");
      return;
    }
    payload.append("image", file);
  }

  clearGeneratorPoller();
  generatorResult.reset();
  setBusy(submitButton, true, `正在提交到 ${providerConfig.name}...`);
  generatorResult.setStatus(`任务已提交，正在创建 ${providerConfig.name} 任务...`, 5, "running");

  try {
    const result = await fetchJson("/api/generate", {
      method: "POST",
      body: payload
    });

    if (!result.taskId) {
      throw createDetailedError(`${providerConfig.name} 没有返回任务 ID，任务创建失败。`, result);
    }

    currentTaskContext = {
      provider: result.provider || provider,
      mode: result.mode || mode,
      modelVersion: result.displayModelVersion || modelVersionSelect.selectedOptions[0]?.textContent || modelVersionSelect.value,
      providerName: PROVIDER_CONFIG[result.provider || provider]?.name || providerConfig.name
    };

    generatorResult.renderTaskMeta(result.taskId, currentTaskContext);
    await pollGeneratorTask(result.taskId, currentTaskContext.provider);
  } catch (error) {
    generatorResult.setStatus(error.message || "提交失败。", 0, "error");
    if (error.details) {
      generatorResult.resultJson.textContent = JSON.stringify(error.details, null, 2);
      generatorResult.resultJson.classList.remove("hidden");
    }
  } finally {
    setBusy(submitButton, false, "开始生成 3D 模型");
  }
}

async function handleOptimizerSubmit(event) {
  event.preventDefault();

  const provider = getCurrentOptimizerProvider();
  const operation = getCurrentOptimizerOperation();
  const payload = new FormData();
  payload.append("provider", provider);
  payload.append("operation", operation);
  payload.append("modelVersion", optimizerModelVersionSelect.value);
  payload.append("target", optimizerTargetSelect.value);
  payload.append("saveMode", optimizerSaveModeSelect.value);

  const modelFile = modelFileInput.files?.[0];
  const modelUrl = modelUrlInput.value.trim();

  if (!modelFile && !modelUrl) {
    optimizerResult.setStatus("请上传模型文件或填写模型 URL。", 0, "error");
    return;
  }

  if (modelFile) {
    payload.append("modelFile", modelFile);
  }

  if (modelUrl) {
    payload.append("modelUrl", modelUrl);
  }

  if (operation === "retexture") {
    const texturePrompt = texturePromptInput.value.trim();
    const styleImage = styleImageInput.files?.[0];

    if (!texturePrompt && !styleImage) {
      optimizerResult.setStatus("AI贴图至少需要贴图提示词或一张风格参考图。", 0, "error");
      return;
    }

    payload.append("texturePrompt", texturePrompt);
    payload.append("preserveUv", String(preserveUvInput.checked));
    payload.append("enablePbr", String(enablePbrInput.checked));
    payload.append("removeLighting", String(removeLightingInput.checked));

    if (styleImage) {
      payload.append("styleImage", styleImage);
    }
  } else {
    payload.append("splitPrompt", splitPromptInput.value.trim());
    payload.append("splitStrategy", splitStrategyInput.value);
  }

  clearOptimizerPoller();
  optimizerResult.reset();
  setBusy(optimizerSubmitButton, true, operation === "retexture" ? "正在提交 AI 贴图..." : "正在提交 AI 拆模型...");
  optimizerResult.setStatus(operation === "retexture" ? "正在创建 AI 贴图任务..." : "正在创建 AI 拆模型任务...", 5, "running");

  try {
    const result = await fetchJson("/api/model-optimize", {
      method: "POST",
      body: payload
    });

    if (!result.taskId) {
      throw createDetailedError("优化任务没有返回任务 ID。", result);
    }

    currentOptimizationContext = {
      provider: result.provider || provider,
      providerName: OPTIMIZER_PROVIDER_CONFIG[result.provider || provider]?.name || provider,
      modelVersion: result.displayModelVersion || optimizerModelVersionSelect.value,
      operation: result.operation || operation,
      operationLabel: result.operation === "split" ? "AI拆模型" : "AI贴图"
    };

    optimizerResult.renderTaskMeta(result.taskId, currentOptimizationContext);
    await pollOptimizerTask(result.taskId, currentOptimizationContext.provider, currentOptimizationContext.operation);
  } catch (error) {
    optimizerResult.setStatus(error.message || "提交失败。", 0, "error");
    if (error.details) {
      optimizerResult.resultJson.textContent = JSON.stringify(error.details, null, 2);
      optimizerResult.resultJson.classList.remove("hidden");
    }
  } finally {
    setBusy(optimizerSubmitButton, false, operation === "retexture" ? "开始 AI 贴图" : "开始 AI 拆模型");
  }
}

async function pollGeneratorTask(taskId, provider) {
  clearGeneratorPoller();

  const run = async () => {
    try {
      const task = await fetchJson(`/api/task/${taskId}?provider=${encodeURIComponent(provider)}`);
      const progress = typeof task.progress === "number" ? task.progress : 0;
      const tone =
        task.status === "success"
          ? "success"
          : task.finalized && task.status !== "success"
            ? "error"
            : "running";

      if (task.transition?.nextTaskId && task.transition.nextTaskId !== taskId) {
        currentTaskContext = {
          provider,
          mode: task.mode || currentTaskContext?.mode || getCurrentMode(),
          modelVersion: task.displayModelVersion || currentTaskContext?.modelVersion || modelVersionSelect.value,
          providerName: task.providerName || currentTaskContext?.providerName || PROVIDER_CONFIG[provider]?.name || provider
        };
        generatorResult.renderTaskMeta(task.transition.nextTaskId, currentTaskContext, task.transition.stageText);
        generatorResult.setStatus(task.transition.statusText || "正在进入下一阶段...", progress, "running");
        clearGeneratorPoller();
        await pollGeneratorTask(task.transition.nextTaskId, provider);
        return;
      }

      currentTaskContext = {
        provider,
        mode: task.mode || currentTaskContext?.mode || getCurrentMode(),
        modelVersion: task.displayModelVersion || currentTaskContext?.modelVersion || modelVersionSelect.value,
        providerName: task.providerName || currentTaskContext?.providerName || PROVIDER_CONFIG[provider]?.name || provider
      };

      generatorResult.renderTaskMeta(task.taskId || taskId, currentTaskContext, task.stageText);
      generatorResult.setStatus(task.statusText || task.status, progress, tone);
      generatorResult.renderTask(task);

      if (task.finalized) {
        clearGeneratorPoller();
      }
    } catch (error) {
      clearGeneratorPoller();
      generatorResult.setStatus(error.message || "查询任务状态失败。", 0, "error");
      if (error.details) {
        generatorResult.resultJson.textContent = JSON.stringify(error.details, null, 2);
        generatorResult.resultJson.classList.remove("hidden");
      }
    }
  };

  await run();
  activeGeneratorPoller = setInterval(run, 4000);
}

async function pollOptimizerTask(taskId, provider, operation) {
  clearOptimizerPoller();

  const run = async () => {
    try {
      const task = await fetchJson(
        `/api/model-optimize/task/${taskId}?provider=${encodeURIComponent(provider)}&operation=${encodeURIComponent(operation)}`
      );
      const progress = typeof task.progress === "number" ? task.progress : 0;
      const tone =
        task.status === "success"
          ? "success"
          : task.finalized && task.status !== "success"
            ? "error"
            : "running";

      currentOptimizationContext = {
        provider,
        providerName: task.providerName || currentOptimizationContext?.providerName || provider,
        modelVersion: task.displayModelVersion || currentOptimizationContext?.modelVersion || optimizerModelVersionSelect.value,
        operation: task.operation || currentOptimizationContext?.operation || operation,
        operationLabel: task.operation === "split" ? "AI拆模型" : "AI贴图"
      };

      optimizerResult.renderTaskMeta(task.taskId || taskId, currentOptimizationContext, task.stageText);
      optimizerResult.setStatus(task.statusText || task.status, progress, tone);
      optimizerResult.renderTask(task);

      if (task.finalized) {
        clearOptimizerPoller();
      }
    } catch (error) {
      clearOptimizerPoller();
      optimizerResult.setStatus(error.message || "查询优化任务状态失败。", 0, "error");
      if (error.details) {
        optimizerResult.resultJson.textContent = JSON.stringify(error.details, null, 2);
        optimizerResult.resultJson.classList.remove("hidden");
      }
    }
  };

  await run();
  activeOptimizerPoller = setInterval(run, 4000);
}

function setBusy(button, isBusy, text) {
  button.disabled = isBusy;
  button.textContent = text;
}

function getCurrentWorkspace() {
  return document.querySelector('input[name="workspace"]:checked').value;
}

function getCurrentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function getCurrentProvider() {
  return document.querySelector('input[name="provider"]:checked').value;
}

function getCurrentOptimizerProvider() {
  return document.querySelector('input[name="optimizerProvider"]:checked').value;
}

function getCurrentOptimizerOperation() {
  return document.querySelector('input[name="optimizerOperation"]:checked').value;
}

function clearGeneratorPoller() {
  if (activeGeneratorPoller) {
    clearInterval(activeGeneratorPoller);
    activeGeneratorPoller = null;
  }
}

function clearOptimizerPoller() {
  if (activeOptimizerPoller) {
    clearInterval(activeOptimizerPoller);
    activeOptimizerPoller = null;
  }
}

function getPreviewModelUrl(task) {
  return (
    task.preferredModelUrl ||
    task.modelUrls?.pbrModel ||
    task.modelUrls?.baseModel ||
    task.modelUrls?.model ||
    task.modelUrls?.glb ||
    task.modelUrls?.fbx ||
    task.modelUrls?.obj ||
    task.modelUrls?.stl ||
    null
  );
}

function formatStatus(status) {
  const map = {
    queued: "排队中",
    running: "处理中",
    success: "处理成功",
    failed: "处理失败",
    banned: "任务被拦截",
    expired: "任务已过期",
    cancelled: "任务已取消",
    unknown: "状态未知",
    PENDING: "排队中",
    IN_PROGRESS: "处理中",
    SUCCEEDED: "处理成功",
    FAILED: "处理失败",
    CANCELED: "任务已取消"
  };
  return map[status] || status;
}

function createPill(text) {
  const div = document.createElement("div");
  div.className = "task-pill";
  div.textContent = text;
  return div;
}

function linkMarkup(label, href) {
  return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw createDetailedError(data.message || "请求失败。", data);
  }

  return data;
}

function createDetailedError(message, details) {
  const error = new Error(message);
  error.details = details;
  return error;
}
