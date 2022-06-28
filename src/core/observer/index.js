/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto, // const hasProto = '__proto__' in {}
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value;
    this.dep = new Dep();
    this.vmCount = 0;

    // 添加 __ob__ 属性 值为 this（observer实例） 相互引用 这样就把value 和 observer 关联起来了
    // __ob__ 必须定义成不可枚举的，否则会陷入死循环。因为observer 和 value 是相互引用的。
    def(value, "__ob__", this);

    // 数组
    if (Array.isArray(value)) {
      // 运行环境是否支持 __proto__ 属性，因为 __proto__ 是非标准属性，不是所有浏览器都支持
      if (hasProto) {
        // 修改原型 直接继承
        protoAugment(value, arrayMethods);
      } else {
        // 直接添加到数组上
        copyAugment(value, arrayMethods, arrayKeys);
      }

      this.observeArray(value);
    } else {
      // 对象
      this.walk(value);
    }
  }

  walk(obj: Object) {
    const keys = Object.keys(obj);

    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  // 数组的每一项
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

export function observe(value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return;
  }
  let ob: Observer | void;

  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    // 本身就是响应式对象
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue // 不是 vm
  ) {
    ob = new Observer(value);
  }

  // asRootData： value 是否是data选项，而不是data上的某一个属性
  if (asRootData && ob) {
    // 如果data是根选项，那observer.vmCount++，所以在set 和 del等地方看到，通过 ob.vmCount 是否大于 0 来判断 target 是否为 $data。data下的子属性的observer.vmCount 均为 0
    ob.vmCount++;
  }

  // 返回observer实例
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 每个 key 对应一个 dep 实例
  const dep = new Dep();
  const property = Object.getOwnPropertyDescriptor(obj, key);

  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get;
  const setter = property && property.set;

  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // 是否递归深层次开启响应式
  let childOb = !shallow && observe(val);

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;

      // 当前组件的 watcher 实例
      if (Dep.target) {
        // 依赖收集
        dep.depend();

        /**
         * 判断 childOb，并调用 childOb.dep.depend() 收集依赖，这就是为什么执行 Vue.set 的时候通过 ob.dep.notify() 能够通知到 watcher，
         * 从而让添加新的属性到对象也可以检测到变化。(因为给值是对象类型的对象上添加了observer实例，设置新的属性后，会通过observer访问到dep，从而出发notify)
         */
        if (childOb) {
          childOb.dep.depend();

          // 如果 value 是数组，那么就通过 dependArray 把数组每个元素也去做依赖收集。
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }

      return value;
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;

      /* eslint-disable no-self-compare */ // NaN的情况
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }

      if (getter && !setter) return;
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }

      // 监听新值
      childOb = !shallow && observe(newVal);
      // 派发更新
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    // undefined null 基础类型的值
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn();
  }

  // 数组
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);

    // 会触发重写的splice 内部会对值做响应式处理
    target.splice(key, 1, val);
    return val;
  }

  // 对象上已经存在的属性，其实就是修改值的操作
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  // $flow-disable-line
  const ob = target.__ob__; // 获取targer对应的observer实例

  // vm 或 $data
  if (target._isVue /* vm */ || (ob && ob.vmCount) /* $data */) {
    // 不允许直接修改 vm上的属性 或 直接修改 $data
    process.env.NODE_ENV !== "production" && warn();
    return val;
  }

  // 如果target是非响应式对象 只修改值
  if (!ob) {
    target[key] = val;
    return val;
  }

  // 否则对新属性开启响应式
  defineReactive(ob.value, key, val);

  // 手动触发组件的更新
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn();
  }

  // 数组
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }

  // $flow-disable-line
  const ob = target.__ob__;

  // vm 或 $data
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" && warn();
    return;
  }
  if (!hasOwn(target, key)) {
    return;
  }

  delete target[key];

  if (!ob) {
    return;
  }
  // 如果是响应式数据，需要通知更新视图
  ob.dep.notify();
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  // 如果数组每一项也是普通值，则在 observe 时不会做处理。
  // 如果数组的每一项是 对象或数组，在observe 时已经开启了响应式，也就拥有了 __ob__ 属性，所以可以进一步对他们进行依赖收集
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    // console.log("e", e);
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
