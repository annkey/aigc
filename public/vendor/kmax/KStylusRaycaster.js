import * as THREE from "three";

/**
 * 射线笔碰撞检测及事件响应
 */
class KStylusRaycaster extends EventTarget {
    press = false;
    drag = false;
    lastKey = 0;
    hitObject = null;
    dragObject = null;
    offset = new THREE.Vector3();
    rotation = new THREE.Quaternion();

    /**
     * 通过射线构建碰撞检测
     * @param {THREE.Scene} scene 场景
     */
    constructor(scene) {
        super();
        // 射线
        this.points = [];
        this.points.push(new THREE.Vector3(0, 0, 0));
        this.points.push(new THREE.Vector3(0, 0, -1));
        // points.push(new THREE.Vector3(0, 0.01, -1 + 0.1));
        // points.push(new THREE.Vector3(0, 0, -1 + 0.1));
        
        const line_geometry = new THREE.BufferGeometry().setFromPoints(this.points);
        const line_mat = new THREE.LineBasicMaterial({ color: 0x0000ff });
        const line = new THREE.Line(line_geometry, line_mat);
        scene.add(line);
        // 尖锥
        const geometryHelper = new THREE.ConeGeometry( 0.005, 0.02, 20 );
        geometryHelper.translate( 0, -0.01, 0 );
        geometryHelper.rotateX( -Math.PI / 2 );
        this.helper = new THREE.Mesh( geometryHelper, new THREE.MeshPhongMaterial({color: 0xffffff}) );
        this.helper.castShadow = true;
        scene.add( this.helper );
        this.line = line;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1;
    }

    /**
     * 更新射线姿态
     * @param {*} pen Pose
     */
    updatePose(pen) {
        if (!pen) {
            this.helper.position.set(0, -100, 0);
            return;
        }
        const rot = pen.rot;
        this.line.position.set(pen.pos.x, pen.pos.y, -pen.pos.z);
        this.line.quaternion.set(-rot.x, -rot.y, rot.z, rot.w);
    }

    /**
     * 射线检测
     * @param {THREE.Object3D[]} objects 要检测的对象集合
     * @returns 检测结果
     */
    intersectObjects(objects) {
        let dir = new THREE.Vector3();
        this.line.getWorldDirection(dir);
        this.raycaster.set(this.line.position, dir.negate());
        const intersects = this.raycaster.intersectObjects( objects );
        // 更新指针
        if ( intersects.length > 0 ) {
            this.helper.position.set( 0, 0, 0 );
            // helper.lookAt( intersects[ 0 ].face.normal );
            this.helper.quaternion.copy(this.line.quaternion);
            this.helper.position.copy( intersects[ 0 ].point );
            this.points[1].set(0, 0, -intersects[0].distance);
        } else {
            this.helper.position.set(0, -100, 0);
            this.points[1].set(0, 0, -1.0);
        }
        this.line.geometry.setFromPoints(this.points);
        return intersects;
    }

    /**
     * 处理按键输入
     * @param {Number} penKey 输入的按键
     * @param {THREE.Object3D[]} intersects 检测结果
     */
    processKey(penKey, intersects) {
        this.press = penKey > 0;
        this.hitObject = intersects.length > 0 ? intersects[0].object : null;
        // 按键事件
        if (penKey > 0 && this.lastKey == 0) {
            console.log("press button.", intersects);
            // todo: 按下具体交互
            if (this.hitObject) {
                // this.hitObject.material.color.set( 0xffffff * Math.random() );
                this.dispatchEvent(new CustomEvent("press", { hitObject: this.hitObject }));
            }
        }
        if (penKey > 0 && this.lastKey == penKey) {
            // console.log("drag.", intersects);
            // todo: 按住具体交互
            if (this.drag && this.dragObject) {
                const rot2 = this.line.quaternion.clone().multiply(this.rotation);
                this.dragObject.quaternion.copy(rot2);
                let pos2 = this.offset.clone().applyQuaternion(rot2)
                pos2.add(this.line.position);
                this.dragObject.position.copy(pos2);
            }
            if (this.hitObject && !this.drag) {
                console.log("begin drag.");
                this.drag = true;
                this.dragObject = this.hitObject;
                this.offset = this.hitObject.position.clone().sub(this.line.position);
                this.offset.applyQuaternion(this.hitObject.quaternion.clone().invert());
                this.rotation = this.line.quaternion.clone().invert().multiply(this.hitObject.quaternion);
            }
        }
        if (penKey == 0 && this.lastKey > 0) {
            if (this.drag) {
                console.log("end drag.");
                this.drag = false;
                this.dragObject = null;
            }
            console.log("release button.", intersects);
            // todo: 抬起具体交互
            if (this.hitObject) {
                this.dispatchEvent(new CustomEvent("release", { hitObject: this.hitObject }));
            }
        }
        this.lastKey = penKey;
    }

}

export {KStylusRaycaster};
