import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";

function Vue(options) {
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  this._init(options);
}

// 初始化Vue的原型
// _init
initMixin(Vue);

// $data $props $set $delete $watch
stateMixin(Vue);

// $on $off $once $emit
eventsMixin(Vue);

// _update $forceUpdate $destory
lifecycleMixin(Vue);

// $nextTick _render
renderMixin(Vue);

export default Vue;
