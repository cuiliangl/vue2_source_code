/* @flow */

import { _Set as Set, isObject } from "../util/index";
import type { SimpleSet } from "../util/index";
import VNode from "../vdom/vnode";

const seenObjects = new Set();

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse(val: any) {
  _traverse(val, seenObjects);
  seenObjects.clear();
}

// 递归遍历 每一个key的变化都会引起回调函数的执行
// 对一个对象做深层递归遍历，因为遍历过程中就是对一个子对象的访问，会触发它们的 getter 过程，这样就可以收集到依赖，也就是订阅它们变化的 watcher
// 遍历过程中会把子响应式对象通过它们的 dep id 记录到 seenObjects，避免以后重复访问。
function _traverse(val: any, seen: SimpleSet) {
  let i, keys;
  const isA = Array.isArray(val);
  if (
    (!isA && !isObject(val)) ||
    Object.isFrozen(val) ||
    val instanceof VNode
  ) {
    return;
  }

  if (val.__ob__) {
    const depId = val.__ob__.dep.id;
    if (seen.has(depId)) {
      return;
    }
    seen.add(depId);
  }

  if (isA) {
    i = val.length;
    while (i--) _traverse(val[i], seen);
  } else {
    keys = Object.keys(val);
    i = keys.length;
    while (i--) _traverse(val[keys[i]], seen);
  }
}

/**
 * 开发中可以作为性能优化的一个点：
 * 1. 如果只是监听深层次对象的某一个属性，采用 'obj.info.name': handler 的方式。
 * 2. 如果是希望任何一个属性的变化都要引起回调的执行，那么采用 { deep: true } 选项。
 */
