/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import { warn, nextTick, devtools, inBrowser, isIE } from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

// 恢复状态
function resetSchedulerState() {
  // 把控制流程状态的变量恢复到初始值， watcher 队列清空
  index = queue.length = activatedChildren.length = 0
  has = {}

  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow()

  // 保证了新的 watcher 不会再进入当前队列
  flushing = true
  let watcher, id

  /**
   * 队列排序的目的：
      1.组件的更新由父到子；因为父组件的创建过程是先于子组件的，所以 watcher 的创建也是先父后子，执行顺序也应该保持先父后子。
      2.用户的自定义 watcher 要优先于渲染 watcher 执行；因为用户自定义 watcher 是在渲染 watcher 之前创建的。
      3.如果一个组件在父组件的 watcher 执行期间被销毁，那么它对应的 watcher 执行都可以被跳过，所以父组件的 watcher 应该先执行。
   */
  queue.sort((a, b) => a.id - b.id)

  /**
   * 不缓存 queue.length 是因为 在 watcher 执行run时，可能会加入新的watcher，这时候 flushing 为 true，就会进入 queueWatcher 函数的 else 分支。
   * 然后就会从后往前找，找到第一个待插入 watcher 的 id 比当前队列中 watcher 的 id 大的位置。把 watcher 按照 id 的插入到队列中，因此 queue 的长度发生了变化。
   */
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]

    if (watcher.before) {
      // 组件 watcher
      watcher.before()
    }
    id = watcher.id
    // 移除watcher
    has[id] = null
    // run
    watcher.run()

    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' +
            (watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 恢复状态
  resetSchedulerState()

  // 调用 updated 和 activted 钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

// updated
function callUpdatedHooks(queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent(vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks(queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */

// watcher 都添加到队列中，然后在 nextTick 之后执行 flushSchedulerQueue
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id

  // 保证同一个 watcher 只被添加一次。队列中 watcher 的唯一性
  if (has[id] == null) {
    has[id] = true

    // 下一次事件循环之前可以不停的往队列中添加 watcher
    if (!flushing) {
      queue.push(watcher)
    } else {
      // 处理执行队列中的watcher时 又产生的新watcher
      /**
       * 原则：从后往前找，找到第一个待插入 watcher 的 id 比当前队列中 watcher 的 id 大的位置。把 watcher 按照 id的插入到队列中，因此 queue 的长度会发生变化。
       * 如果新的 watcher id 比 后面的id 小，则继续向前移动指针，插入到当前的 watcher 后面，下一次 for 时就会执行新插入的 watcher
       */
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    // waiting： 保证了对一次事件循环只调用一次 nextTick(flushSchedulerQueue)
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 下一轮事件循环执行
      nextTick(flushSchedulerQueue)
    }
  }
}
