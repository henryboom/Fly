import { _decorator, Component, Node, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('StartUI')
export class StartUI extends Component {
    start() {

    }

    update(deltaTime: number) {

    }

    public onStartButtonClick() {
        console.log("111111111111111")
        director.loadScene("02-GameScene");
    }
}


