import { _decorator, Component, Label } from 'cc';
import { BOMB_COUNT_CHANGED_EVENT, GameManager } from '../GameManager';
const { ccclass, property } = _decorator;

@ccclass('BombUI')
export class BombUI extends Component {
    @property({ type: Label })
    bombCountLabel: Label | null = null;

    private manager: GameManager | null = null;

    protected onEnable(): void {
        this.manager = this.findManager();
        if (this.manager) {
            this.manager.node.off(BOMB_COUNT_CHANGED_EVENT, this.onBombCountChanged, this);
            this.manager.node.on(BOMB_COUNT_CHANGED_EVENT, this.onBombCountChanged, this);
            this.onBombCountChanged(this.manager.getBombCount());
        }
    }

    protected onDisable(): void {
        if (this.manager) {
            this.manager.node.off(BOMB_COUNT_CHANGED_EVENT, this.onBombCountChanged, this);
        }
        this.manager = null;
    }

    private onBombCountChanged(count: number): void {
        const label = this.bombCountLabel ?? this.getComponent(Label);
        if (!label) return;
        label.string = String(Math.max(0, Math.floor(count)));
    }

    private findManager(): GameManager | null {
        if (GameManager.instance) return GameManager.instance;
        const scene = this.node.scene;
        if (!scene) return null;
        return scene.getComponentInChildren(GameManager);
    }
}
