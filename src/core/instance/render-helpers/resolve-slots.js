/* @flow */

import type VNode from "core/vdom/vnode";

/**
 * Runtime helper for resolving raw children VNodes into a slot object.
 */
export function resolveSlots(
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {};
  }
  const slots = {};
  // 可能有多个命名插槽
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i];

    // 插槽节点的属性
    const data = child.data;

    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot;
    }

    // 具名插槽
    if (
      (child.context === context || child.fnContext === context) &&
      data &&
      data.slot != null
    ) {
      const name = data.slot;
      const slot = slots[name] || (slots[name] = []);

      if (child.tag === "template") {
        slot.push.apply(slot, child.children || []);
      } else {
        slot.push(child);
      }
    } else {
      // 默认插槽
      (slots.default || (slots.default = [])).push(child);
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name];
    }
  }

  // console.log(slots);
  return slots;
}

function isWhitespace(node: VNode): boolean {
  return (node.isComment && !node.asyncFactory) || node.text === " ";
}
