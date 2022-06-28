/* @flow */

import { hasOwn } from "shared/util";
import { warn, hasSymbol } from "../util/index";
import { defineReactive, toggleObserving } from "../observer/index";

export function initProvide(vm: Component) {
  const provide = vm.$options.provide;

  if (provide) {
    vm._provided = typeof provide === "function" ? provide.call(vm) : provide;
  }
}

export function initInjections(vm: Component) {
  const result = resolveInject(vm.$options.inject, vm);

  if (result) {
    toggleObserving(false);

    Object.keys(result).forEach((key) => {
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== "production") {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
              `overwritten whenever the provided component re-renders. ` +
              `injection being mutated: "${key}"`,
            vm
          );
        });
      } else {
        defineReactive(vm, key, result[key]);
      }
    });
    toggleObserving(true);
  }
}

export function resolveInject(inject: any, vm: Component): ?Object {
  if (inject) {
    // console.log(inject);
    /**
      * 到这一步之前inject选项已经进行了标准化处理，格式为：
      *  inject = {
          name: {
            from: xxx,
            default: xxx
          },
          age: {
            from: xxx,
            default: xxx
          }
        }
    */
    const result = Object.create(null);
    const keys = hasSymbol ? Reflect.ownKeys(inject) : Object.keys(inject);

    /**
     * 从 inject 配置中获取 from 属性值，然后在父级组件中查找 provide 选项，如果找到就获取对应的值，保存到 result 中；如果没有找到，就继续向上查找，一直到根组件
     * 如果到根组件还没找到 inject 中的 key 在组件链上 provide 的值，那么就检查 inject 中是否设置了默认值，如果设置了默认值，就将其赋值为默认值
     */
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]; // key对应的值 {from, default}

      // 存在 __ob__属性说明已经做过响应式处理了
      if (key === "__ob__") continue;

      const provideKey = inject[key].from; // 属性名
      let source = vm;

      // 从当前组件开始查找(实际上是从父组件开始查找，因为在执行这一步时，provide还没初始化，也就是说实例上还没_provided)
      while (source) {
        // _provided 为组件的 provide 选项
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey];
          break;
        }

        // 当前组件没有就一直往上找
        source = source.$parent; // 一直到根组件还没有，$parent 为undefined
      }

      // 到根组件都没找到检查是否设置了默认值，默认值可以单指 或 函数的返回值
      if (!source) {
        if ("default" in inject[key]) {
          const provideDefault = inject[key].default;
          result[key] =
            typeof provideDefault === "function"
              ? provideDefault.call(vm)
              : provideDefault;
        } else if (process.env.NODE_ENV !== "production") {
          warn(`Injection "${key}" not found`, vm);
        }
      }
    }
    return result;
  }
}
