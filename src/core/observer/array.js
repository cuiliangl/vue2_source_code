/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from "../util/index";

const arrayProto = Array.prototype;
export const arrayMethods = Object.create(arrayProto);

const methodsToPatch = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
];

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // 缓存源方法
  const original = arrayProto[method];

  def(arrayMethods, method, function mutator(...args) {
    const result = original.apply(this, args);
    // observer 实例
    const ob = this.__ob__;

    // 新增加的值
    let inserted;

    switch (method) {
      case "push":
      case "unshift":
        inserted = args;
        break;
      case "splice":
        // [].splice(start, count, ...val)
        inserted = args.slice(2);
        break;
    }

    // 对新值开启响应式
    if (inserted) ob.observeArray(inserted);

    // 通知依赖 更新组件
    ob.dep.notify();
    return result;
  });
});
