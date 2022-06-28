/* @flow */

import config from "../config";
import { initProxy } from "./proxy";
import { initState } from "./state";
import { initRender } from "./render";
import { initEvents } from "./events";
import { mark, measure } from "../util/perf";
import { initLifecycle, callHook } from "./lifecycle";
import { initProvide, initInjections } from "./inject";
import { extend, mergeOptions, formatComponentName } from "../util/index";

let uid = 0;

// 原型上添加 _init 方法
export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this;

    // 每个组件唯一的 uid
    vm._uid = uid++;

    let startTag, endTag;
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`;
      endTag = `vue-perf-end:${vm._uid}`;
      mark(startTag);
    }

    vm._isVue = true;

    // 组件的配置项
    if (options && options._isComponent) {
      // 子组件的配置 组件的构造器都是 VueComponent
      initInternalComponent(vm, options);
    } else {
      // 根实例（组件）的配置 其实这一步的vm就是Vue的实例，这一步只会执行一次 即new Vue时
      vm.$options = mergeOptions(
        //{ components, directives, filters }
        resolveConstructorOptions(vm.constructor), // Vue 构造器
        options || {},
        vm
      );
    }

    // 这一步的目的是什么？ 为什么要代理？
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }

    vm._self = vm;

    // 这里可不是初始化组件生命周期。而是初始化组件的实例属性 比如 $parent $childrens $refs $root isMounted等
    initLifecycle(vm);

    // 初始化组件的自定义事件
    initEvents(vm);

    /**
     * 1. 初始化插槽: vm.$slots、vm.$scopedSlots
     * 2. 定义 _c 方法，即 createElement 方法，也就是 h 函数
     * 3. 对 $attrs 和 $listeners 属性进行响应式处理
     */
    initRender(vm);

    // 执行 beforeCreate，所以在该钩子中就可以访问this，但是访问不到data props methods等属性
    callHook(vm, "beforeCreate");

    // 获取解析之后的 inject 选项，然后把 result 的每一项都代理到 vm 上，并开启响应式处理
    initInjections(vm);

    // 初始化 data props computed 并开启响应式
    initState(vm);

    // 初始化provide 如果存在provide选项 则在实例上添加 _provided 属性
    initProvide(vm);

    // 执行created。至此 数据、事件全部初始化完成，接下来就是挂载阶段了
    callHook(vm, "created");

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== "production" && config.performance && mark) {
      vm._name = formatComponentName(vm, false);
      mark(endTag);
      measure(`vue ${vm._name} init`, startTag, endTag);
    }

    // 挂载
    if (vm.$options.el) {
      vm.$mount(vm.$options.el);
    }
  };
}

// 初始化组件配置
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  // console.dir(vm.constructor.options);
  // 创建子组件的 $options 对象，原型指向子组件构造器的 options 对象
  // vm.constructor：VueComponent 所有组件都是VueComponent的实例， VueComponent 是 Vue的子类
  const opts = (vm.$options = Object.create(vm.constructor.options));

  const parentVnode = options._parentVnode; // 组件的 VNode
  opts.parent = options.parent; // 父组件实例
  opts._parentVnode = parentVnode;

  const vnodeComponentOptions = parentVnode.componentOptions; // 组件选项

  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

// 从构造器上解析配置对象
export function resolveConstructorOptions(Ctor: Class<Component>) {
  // Vue静态属性options： { components, directives, filters, _base }
  let options = Ctor.options;

  // 如果构造器存在super属性，说明还存在基类，则递归处理配置项. Vue肯定不存在该属性
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super);
    // 缓存构造器子类配置选型
    const cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      Ctor.superOptions = superOptions;
      // 获取变更的配置项
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions);
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options;
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  const latest = Ctor.options;
  const sealed = Ctor.sealedOptions;
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
