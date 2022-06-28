/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop,
} from "../util/index";

import { traverse } from "./traverse";
import { queueWatcher } from "./scheduler";
import Dep, { pushTarget, popTarget } from "./dep";

import type { SimpleSet } from "../util/index";

let uid = 0;

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm;

    if (isRenderWatcher) {
      // 渲染watcher
      vm._watcher = this;
    }

    // 当前组件中创建的所有watcher
    vm._watchers.push(this);

    // options
    if (options) {
      // 也就是说 options 只支持以下几个选项
      this.deep = !!options.deep; // 深度监听
      this.user = !!options.user; // 用户调用的： 比如通过 this.$watch 或者 watch 选项
      this.lazy = !!options.lazy;
      this.sync = !!options.sync; // 同步调用：即值变了之后立即执行回调 更新视图
      this.before = options.before;
    } else {
      this.deep = this.user = this.lazy = this.sync = false;
    }

    this.cb = cb;
    this.id = ++uid; // uid for batching
    this.active = true;
    this.dirty = this.lazy; // for lazy watchers

    // 收集了当前 watcher 的所有 dep（也就是哪些 key 收集了 watcher）
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression =
      process.env.NODE_ENV !== "production" ? expOrFn.toString() : "";

    // expOrFn支持函数
    if (typeof expOrFn === "function") {
      this.getter = expOrFn;
    } else {
      this.getter = parsePath(expOrFn);

      if (!this.getter) {
        this.getter = noop;
        process.env.NODE_ENV !== "production" &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              "Watcher only accepts simple dot-delimited paths. " +
              "For full control, use a function instead.",
            vm
          );
      }
    }

    // 计算属性传入的选项 lazy 为 true
    // 如果是计算属性不会立即执行 this.get 获取值，只有访问到该属性的时候（比如执行render函数生成vnode时、或者 watch选项监听了该属性）调用 this.evaluate() 进行求值。
    // 计算属性一般会依赖 data 或者 proos。当计算求值时，会访问 data的属性，那么该属性就会将计算属性对应的watcher 收集起来，当发生改变时通知计算属性的 watcher。
    this.value = this.lazy ? undefined : this.get();
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get() {
    // 将当前Dep上的target的值设置成当前watcher，保证每次读取值时都能得到正确的watcher
    pushTarget(this);

    let value;
    const vm = this.vm;

    try {
      value = this.getter.call(vm, vm);
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // 递归访问value，触发所有子项的getter，将当前watcher都添加到所有属性对应的dep中。
      if (this.deep) {
        traverse(value);
      }
      popTarget();

      // 清理依赖收集
      this.cleanupDeps();
    }
    return value;
  }

  /**
   * 依赖收集
   */
  addDep(dep: Dep) {
    const id = dep.id;

    if (!this.newDepIds.has(id)) {
      /**
       * 每次数据变化都会重新 render，那么 vm._render() 方法又会再次执行，并再次触发数据的 getters，
       * 所以 Watcher 在构造函数中会初始化 2 个 Dep 实例数组，newDeps 表示新添加的 Dep 实例数组，
       * 而 deps 表示上一次添加的 Dep 实例数组。
       */
      this.newDepIds.add(id);
      this.newDeps.push(dep);

      // 防止重复添加watcher。比如一个组件上读取了多次相同的key，只添加一个watcher即可。
      // 还有就是 value改变时，触发watcher的update，重新执行get()，又会触发收集依赖的逻辑。如果没有这个判断，就会发现每当数据发生了变化，Watcher都会读取最新的数据。而读数据就会再次收集依赖，这就会导致Dep中的依赖有重复
      if (!this.depIds.has(id)) {
        // 将当前 watcher 添加到数据 key 对应的 dep 上
        dep.addSub(this);
      }
    }
  }

  /**
   * 清理依赖收集
   *
   * 在添加 deps 的订阅过程，已经能通过 id 去重避免重复订阅，为什么还需要做 deps 订阅的移除呢？
   * 考虑到一种场景，我们的模板会根据 v-if 去渲染不同子模板 a 和 b，当我们满足某种条件的时候渲染 a 的时候，会访问到 a 中的数据，
   * 这时候我们对 a 使用的数据添加了 getter，做了依赖收集，那么当我们去修改 a 的数据的时候，理应通知到这些订阅者。那么如果我们一旦改变了条件渲染了 b 模板，
   * 又会对 b 使用的数据添加了 getter，如果我们没有依赖移除的过程，那么这时候我去修改 a 模板的数据，依然会通知 a 数据的订阅的回调，这显然是有浪费的。
   * 因此 Vue 设计了在每次添加完新的订阅，会移除掉旧的订阅，这样就保证了在我们刚才的场景中，如果渲染 b 模板的时候去修改 a 模板的数据，a 数据订阅回调已经被移除了，所以不会有任何浪费。
   */
  cleanupDeps() {
    let i = this.deps.length;

    while (i--) {
      const dep = this.deps[i];

      if (!this.newDepIds.has(dep.id)) {
        // 移除已经不在使用的 key 对应的dep 上的收集的watcher
        dep.removeSub(this);
      }
    }

    let tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true;
    } else if (this.sync) {
      // 同步：立即执行回调
      this.run();
    } else {
      // 将 watcher 加入到队列中
      queueWatcher(this);
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run() {
    if (this.active) {
      // 获取最新值
      // 对于渲染（组件）watcher来说，this.get() 就是执行 vm._update(vm_render())，从而引发重新渲染组件
      const value = this.get(); // 重新进行一次取指计算

      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep // 深度比较
      ) {
        // set new value
        const oldValue = this.value;
        this.value = value;

        if (this.user) {
          // 用户手动监听的
          const info = `callback for watcher "${this.expression}"`;
          invokeWithErrorHandling(
            this.cb,
            this.vm,
            [value, oldValue],
            this.vm,
            info
          );
        } else {
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate() {
    this.value = this.get();
    this.dirty = false;
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend() {
    let i = this.deps.length;
    while (i--) {
      this.deps[i].depend();
    }
  }

  /**
   * 将自己（watcher）从所依赖的dep中移除
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this);
      }
      let i = this.deps.length;
      while (i--) {
        this.deps[i].removeSub(this);
      }
      this.active = false;
    }
  }
}

/**
 * 执行 mount前 会对组件选项执行初始化工作，如果有 watch 选项，那么监听的每一个属性都会创建新的watcher 实例，并且user为true，没有before方法。
 * 执行 mount时，创建新的 watcher 实例，有user 为false，有before方法，然后调用 mountcomponent，执行 vm._update(mv._render())，创建组件的 VNode，这个过程中会进行取值操作，从而进行依赖收集。
 */
