/* @flow */

import config from "../config";
import { initUse } from "./use";
import { initMixin } from "./mixin";
import { initExtend } from "./extend";
import { initAssetRegisters } from "./assets";
import { set, del } from "../observer/index";
import { ASSET_TYPES } from "shared/constants";
import builtInComponents from "../components/index";
import { observe } from "core/observer/index";

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive,
} from "../util/index";

export function initGlobalAPI(Vue: GlobalAPI) {
  // config
  const configDef = {};
  configDef.get = () => config;
  if (process.env.NODE_ENV !== "production") {
    configDef.set = () => {
      warn(
        "Do not replace the Vue.config object, set individual fields instead."
      );
    };
  }
  // configDef 描述对象 获取config会调用get方法
  Object.defineProperty(Vue, "config", configDef);

  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive,
  };

  Vue.set = set;
  Vue.delete = del;
  Vue.nextTick = nextTick;

  Vue.observable = (obj: any) => {
    observe(obj);
    return obj;
  };

  Vue.options = Object.create(null);

  /**
    const ASSET_TYPES = [
      'component',
      'directive',
      'filter'
    ]
  */
  ASSET_TYPES.forEach((type) => {
    Vue.options[type + "s"] = Object.create(null);
  });

  // 目的是干啥？
  Vue.options._base = Vue;

  // keep-alive
  extend(Vue.options.components, builtInComponents);

  // Vue.use
  initUse(Vue);

  // Vue.mixin
  initMixin(Vue);

  // Vue.extend
  initExtend(Vue);

  // Vue.component Vue.directive Vue.filter
  initAssetRegisters(Vue);
}
