/* @flow */

import { ASSET_TYPES } from "shared/constants";
import { isPlainObject, validateComponentName } from "../util/index";

// Vue.component Vue.filter Vue.directive
export function initAssetRegisters(Vue: GlobalAPI) {
  ASSET_TYPES.forEach((type) => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + "s"][id];
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== "production" && type === "component") {
          validateComponentName(id);
        }
        if (type === "component" && isPlainObject(definition)) {
          definition.name = definition.name || id;
          // this.options._base --> Vue
          // 由此得出 定义的全局组件 都是 VueComponent 的实例
          definition = this.options._base.extend(definition);
        }
        if (type === "directive" && typeof definition === "function") {
          definition = { bind: definition, update: definition };
        }

        // 添加到全局对应的 options 上
        this.options[type + "s"][id] = definition;
        return definition;
      }
    };
  });
}
