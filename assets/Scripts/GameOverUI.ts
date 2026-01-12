import { _decorator, Component, Label, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameOverUI')
export class GameOverUI extends Component {
    @property(Label)
    HighestScoreLabel: Label = null;
    @property(Label)
    LatestScoreLabel: Label = null;

    /**
     * 显示游戏结束UI
     * @param highestScore 最高得分
     * @param latestScore 最新得分
     */
    public showGameOverUI(highestScore: number, latestScore: number): void {
        if (this.HighestScoreLabel) {
            this.HighestScoreLabel.string = highestScore.toString();
        }
        if (this.LatestScoreLabel) {
            this.LatestScoreLabel.string = latestScore.toString();
        }
        console.log("11111111111111111111")
        this.node.active = true;
    }
}


