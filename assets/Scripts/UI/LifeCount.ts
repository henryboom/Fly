import { _decorator, Component, isValid, Label, Node } from 'cc';
import { Player, PLAYER_HP_CHANGED_EVENT } from '../Player';
const { ccclass, property } = _decorator;

@ccclass('LifeCount')
export class LifeCount extends Component {
    @property({ type: Label })
    hpLabel: Label | null = null;

    private player: Player | null = null;
    private eventTarget: Node | null = null;

    protected onEnable(): void {
        this.player = this.findPlayer();
        if (this.player) {
            this.eventTarget = this.player.node;
            this.eventTarget.off(PLAYER_HP_CHANGED_EVENT, this.onHpChanged, this);
            this.eventTarget.on(PLAYER_HP_CHANGED_EVENT, this.onHpChanged, this);
            this.onHpChanged(this.player.getHp(), this.player.getMaxHp());
        }
    }

    protected onDisable(): void {
        if (this.eventTarget && isValid(this.eventTarget, true)) {
            this.eventTarget.off(PLAYER_HP_CHANGED_EVENT, this.onHpChanged, this);
        }
        this.eventTarget = null;
        this.player = null;
    }

    private onHpChanged(hp: number, maxHp: number): void {
        const safeMax = Math.max(1, Math.floor(maxHp));
        const safeHp = Math.max(0, Math.min(safeMax, Math.floor(hp)));

        const label = this.hpLabel ?? this.getComponent(Label);
        if (label) label.string = `${safeHp}/${safeMax}`;
    }

    private findPlayer(): Player | null {
        const scene = this.node.scene;
        if (!scene) return null;
        return scene.getComponentInChildren(Player);
    }
}
