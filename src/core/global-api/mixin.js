/* @flow */

import { mergeOptions } from "../util/index";

export function initMixin(Vue: GlobalAPI) {
  // 全局混入 把目标 mixin 对象和Vue.options 进行合并，因为组件每次创建实例时都会将自身的配置选项和构造器的options对象进行合并。
  Vue.mixin = function (mixin: Object) {
    this.options = mergeOptions(this.options, mixin);
    return this;
  };
}
