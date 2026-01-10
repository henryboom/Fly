import { _decorator, Component, isValid } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Bullet')
export class Bullet extends Component {
    @property
    speed: number = 800;

    @property
    damage: number = 1;

    hasHit: boolean = false;

    private readonly destroyY = 1000;

    start() {
        this.hasHit = false;
    }

    update(deltaTime: number) {
        if (!isValid(this.node, true)) return;
        //deltaTime 是两帧之间的时间间隔，单位是“秒”
        //用 speed * deltaTime 可以让子弹每秒移动固定距离，帧率高低都能保持一致的飞行速度
        let position = this.node.position;
        //子弹通常朝上飞：y 增加
        let nextY = position.y + this.speed * deltaTime;
        this.node.setPosition(position.x, nextY, position.z);

        //飞出屏幕后销毁节点，避免场景里子弹越来越多造成卡顿
        if (nextY > this.destroyY) {
            if (isValid(this.node, true)) this.node.destroy();
        }
    }
}

