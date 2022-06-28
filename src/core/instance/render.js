/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive,
} from "../util/index";

import { createElement } from "../vdom/create-element";
import { installRenderHelpers } from "./render-helpers/index";
import { resolveSlots } from "./render-helpers/resolve-slots";
import { normalizeScopedSlots } from "../vdom/helpers/normalize-scoped-slots";
import VNode, { createEmptyVNode } from "../vdom/vnode";

import { isUpdatingChildComponent } from "./lifecycle";

export function initRender(vm: Component) {
  vm._vnode = null;
  vm._staticTrees = null;
  const options = vm.$options;

  // 实例的 $vnode 是 组件实例(标签)的 VNode
  const parentVnode = (vm.$vnode = options._parentVnode);

  // VNode所处的上下文：1. 模版Vnode上下文为组件实例 2. 组件Vnode所处的上下文为父组件实例
  const renderContext = parentVnode && parentVnode.context;

  // 获取slots  _renderChildren 组件标签的插槽节点，插槽节点和组件实例（标签）的VNode 所处同一个上下文
  vm.$slots = resolveSlots(options._renderChildren, renderContext);
  vm.$scopedSlots = emptyObject;

  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false);

  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true);

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data;

  // 对$attrs $listeners 开启响应式
  /* istanbul ignore else */
  if (process.env.NODE_ENV !== "production") {
    defineReactive(
      vm,
      "$attrs",
      // value
      (parentData && parentData.attrs) || emptyObject,

      // 自定义setter
      () => {
        !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm);
      },
      // shallow
      true
    );
    defineReactive(
      vm,
      "$listeners",
      options._parentListeners || emptyObject,
      () => {
        !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm);
      },
      true
    );
  } else {
    // 浅层响应式
    defineReactive(
      vm,
      "$attrs",
      (parentData && parentData.attrs) || emptyObject,
      null,
      true
    );
    defineReactive(
      vm,
      "$listeners",
      options._parentListeners || emptyObject,
      null,
      true
    );
  }
}

export let currentRenderingInstance: Component | null = null;

// for testing only
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm;
}

export function renderMixin(Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype);

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this);
  };

  // 创建VNode
  Vue.prototype._render = function (): VNode {
    const vm: Component = this;
    const { render, _parentVnode /** 组件实例的VNode */ } = vm.$options;

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      );
    }

    // 组件实例的VNode
    vm.$vnode = _parentVnode;

    let vnode;
    try {
      currentRenderingInstance = vm;

      // vm.$createElement 即 h 函数，即该函数是提供给用户调用的
      vnode = render.call(vm._renderProxy, vm.$createElement);
    } catch (e) {
      handleError(e, vm, `render`);
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== "production" && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(
            vm._renderProxy,
            vm.$createElement,
            e
          );
        } catch (e) {
          handleError(e, vm, `renderError`);
          vnode = vm._vnode;
        }
      } else {
        vnode = vm._vnode;
      }
    } finally {
      currentRenderingInstance = null;
    }

    // 每个组件只能有一个根节点
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0];
    }

    // 如果render的返回值不是VNode，则创建一个空的 VNode
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== "production" && Array.isArray(vnode)) {
        warn(
          "Multiple root nodes returned from render function. Render function " +
            "should return a single root node.",
          vm
        );
      }
      vnode = createEmptyVNode();
    }

    // 组件实例的VNode
    vnode.parent = _parentVnode;
    return vnode;
  };
}
