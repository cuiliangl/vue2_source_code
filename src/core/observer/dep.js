/* @flow */

import type Watcher from "./watcher";
import { remove } from "../util/index";
import config from "../config";

let uid = 0;

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */

// 对 Watcher 的管理 Dep 脱离 Watcher单独存在是没有意义的
/**
 * Dep 和 Watcher 是相互依赖的。Dep需要保存Watcher实例（也就是说有哪些watcher依赖于该dep对应的属性），Watcher 需要保存dep，也就是需要记录它依赖于哪些dep(属性)
 * 所以：属性的getter 和 setter，其实是在getter中进行watcher（观察者）的订阅，在setter中发布。
 */
export default class Dep {
  // 全局唯一 Watcher，保证了同一时刻只有一个全局的 Watcher 被计算
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor() {
    this.id = uid++;
    this.subs = [];
  }

  // 收集 watcher
  addSub(sub: Watcher) {
    this.subs.push(sub);
  }

  removeSub(sub: Watcher) {
    remove(this.subs, sub);
  }

  depend() {
    // 此刻的 watcher
    if (Dep.target) {
      // 将当前属性对应的 dep 添加到 watcher上
      Dep.target.addDep(this);
    }
  }

  notify() {
    const subs = this.subs.slice();
    if (process.env.NODE_ENV !== "production" && !config.async) {
      // 排序 确保正确的调用顺序
      subs.sort((a, b) => a.id - b.id);
    }

    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update();
    }
  }
}

// 同一时刻全局只有一个watcher在执行
Dep.target = null;
const targetStack = [];

export function pushTarget(target: ?Watcher) {
  targetStack.push(target);
  Dep.target = target;
}

// 当前 vm 的依赖收集完成，把 Dep.target 恢复成上一个状态
export function popTarget() {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}
