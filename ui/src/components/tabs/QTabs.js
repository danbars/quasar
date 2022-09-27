import Vue from 'vue'

import QIcon from '../icon/QIcon.js'
import QResizeObserver from '../resize-observer/QResizeObserver.js'

import TimeoutMixin from '../../mixins/timeout.js'
import ListenersMixin from '../../mixins/listeners.js'

import { stop, noop } from '../../utils/event.js'
import { slot } from '../../utils/private/slot.js'
import cache from '../../utils/private/cache.js'
import { rtlHasScrollBug } from '../../utils/scroll.js'

function getIndicatorClass (color, top, vertical) {
  const pos = vertical === true
    ? ['left', 'right']
    : ['top', 'bottom']

  return `absolute-${top === true ? pos[0] : pos[1]}${color ? ` text-${color}` : ''}`
}

const alignValues = [ 'left', 'center', 'right', 'justify' ]
const emptyFn = () => {}

export default Vue.extend({
  name: 'QTabs',

  mixins: [ TimeoutMixin, ListenersMixin ],

  provide () {
    return {
      $tabs: this
    }
  },

  props: {
    value: [Number, String],

    align: {
      type: String,
      default: 'center',
      validator: v => alignValues.includes(v)
    },
    breakpoint: {
      type: [String, Number],
      default: 600
    },

    vertical: Boolean,
    shrink: Boolean,
    stretch: Boolean,

    activeClass: String,
    activeColor: String,
    activeBgColor: String,
    indicatorColor: String,
    leftIcon: String,
    rightIcon: String,

    outsideArrows: Boolean,
    mobileArrows: Boolean,

    switchIndicator: Boolean,

    narrowIndicator: Boolean,
    inlineLabel: Boolean,
    noCaps: Boolean,

    dense: Boolean,

    contentClass: String
  },

  data () {
    return {
      scrollable: false,
      leftArrow: true,
      rightArrow: false,
      justify: false,

      // used by children
      currentModel: this.value,
      hasFocus: false,
      avoidRouteWatcher: false
    }
  },

  watch: {
    isRTL () {
      this.__localUpdateArrows()
    },

    value (name) {
      this.__updateModel({ name, setCurrent: true, skipEmit: true })
    },

    outsideArrows () {
      this.__recalculateScroll()
    },

    arrowsEnabled (v) {
      this.__localUpdateArrows = v === true
        ? this.__updateArrowsFn
        : noop

      this.__recalculateScroll()
    }
  },

  computed: {
    // used by children
    tabProps () {
      return {
        activeClass: this.activeClass,
        activeColor: this.activeColor,
        activeBgColor: this.activeBgColor,
        indicatorClass: getIndicatorClass(
          this.indicatorColor,
          this.switchIndicator,
          this.vertical
        ),
        narrowIndicator: this.narrowIndicator,
        inlineLabel: this.inlineLabel,
        noCaps: this.noCaps
      }
    },

    arrowsEnabled () {
      return this.$q.platform.is.desktop === true || this.mobileArrows === true
    },

    alignClass () {
      const align = this.scrollable === true
        ? 'left'
        : (this.justify === true ? 'justify' : this.align)

      return `q-tabs__content--align-${align}`
    },

    classes () {
      return 'q-tabs row no-wrap items-center' +
        ` q-tabs--${this.scrollable === true ? '' : 'not-'}scrollable` +
        ` q-tabs--${this.vertical === true ? 'vertical' : 'horizontal'}` +
        ` q-tabs__arrows--${this.arrowsEnabled === true && this.outsideArrows === true ? 'outside' : 'inside'}` +
        (this.dense === true ? ' q-tabs--dense' : '') +
        (this.shrink === true ? ' col-shrink' : '') +
        (this.stretch === true ? ' self-stretch' : '')
    },

    innerClass () {
      return 'q-tabs__content row no-wrap items-center self-stretch hide-scrollbar relative-position ' +
        this.alignClass +
        (this.contentClass !== void 0 ? ` ${this.contentClass}` : '') +
        (this.$q.platform.is.mobile === true ? ' scroll' : '')
    },

    domProps () {
      return this.vertical === true
        ? { container: 'height', content: 'offsetHeight', scroll: 'scrollHeight' }
        : { container: 'width', content: 'offsetWidth', scroll: 'scrollWidth' }
    },

    isRTL () {
      return this.vertical !== true && this.$q.lang.rtl === true
    },

    rtlPosCorrection () {
      return rtlHasScrollBug() === false && this.isRTL === true
    },

    // let's speed up execution of time-sensitive scrollTowards()
    // with a computed variable by directly applying the minimal
    // number of instructions on get/set functions
    posFn () {
      return this.rtlPosCorrection === true
        ? { get: content => Math.abs(content.scrollLeft), set: (content, pos) => { content.scrollLeft = -pos } }
        : (
          this.vertical === true
            ? { get: content => content.scrollTop, set: (content, pos) => { content.scrollTop = pos } }
            : { get: content => content.scrollLeft, set: (content, pos) => { content.scrollLeft = pos } }
        )
    },

    onEvents () {
      return {
        input: stop,
        ...this.qListeners,
        focusin: this.__onFocusin,
        focusout: this.__onFocusout
      }
    }
  },

  methods: {
    // used by children too
    __updateModel ({ name, setCurrent, skipEmit, fromRoute }) {
      if (this.currentModel !== name) {
        skipEmit !== true && this.$emit('input', name)
        if (
          setCurrent === true ||
          this.qListeners.input === void 0
        ) {
          this.__animate(this.currentModel, name)
          this.currentModel = name
        }
      }

      if (fromRoute !== void 0) {
        this.localFromRoute = fromRoute
      }
    },

    __recalculateScroll () {
      this.__registerScrollTick(() => {
        this.__updateContainer({
          width: this.$el.offsetWidth,
          height: this.$el.offsetHeight
        })
      })
    },

    __updateContainer (domSize) {
      // it can be called faster than component being initialized
      // so we need to protect against that case
      // (one example of such case is the docs release notes page)
      if (this.domProps === void 0 || !this.$refs.content) { return }

      const
        size = domSize[ this.domProps.container ],
        scrollSize = Math.min(
          this.$refs.content[this.domProps.scroll],
          Array.prototype.reduce.call(
            this.$refs.content.children,
            (acc, el) => acc + (el[ this.domProps.content ] || 0),
            0
          )
        ),
        scroll = size > 0 && scrollSize > size // when there is no tab, in Chrome, size === 0 and scrollSize === 1

      if (this.scrollable !== scroll) {
        this.scrollable = scroll
      }

      // Arrows need to be updated even if the scroll status was already true
      scroll === true && this.__registerUpdateArrowsTick(this.__localUpdateArrows)

      const localJustify = size < parseInt(this.breakpoint, 10)

      if (this.justify !== localJustify) {
        this.justify = localJustify
      }
    },

    __animate (oldName, newName) {
      const
        oldTab = oldName !== void 0 && oldName !== null && oldName !== ''
          ? this.tabList.find(tab => tab.name === oldName)
          : null,
        newTab = newName !== void 0 && newName !== null && newName !== ''
          ? this.tabList.find(tab => tab.name === newName)
          : null

      if (oldTab && newTab) {
        const
          oldEl = oldTab.$refs.tabIndicator,
          newEl = newTab.$refs.tabIndicator

        clearTimeout(this.animateTimer)

        oldEl.style.transition = 'none'
        oldEl.style.transform = 'none'
        newEl.style.transition = 'none'
        newEl.style.transform = 'none'

        const
          oldPos = oldEl.getBoundingClientRect(),
          newPos = newEl.getBoundingClientRect()

        newEl.style.transform = this.vertical === true
          ? `translate3d(0,${oldPos.top - newPos.top}px,0) scale3d(1,${newPos.height ? oldPos.height / newPos.height : 1},1)`
          : `translate3d(${oldPos.left - newPos.left}px,0,0) scale3d(${newPos.width ? oldPos.width / newPos.width : 1},1,1)`

        // allow scope updates to kick in (QRouteTab needs more time)
        this.__registerAnimateTick(() => {
          this.animateTimer = setTimeout(() => {
            newEl.style.transition = 'transform .25s cubic-bezier(.4, 0, .2, 1)'
            newEl.style.transform = 'none'
          }, 70)
        })
      }

      if (newTab && this.scrollable === true) {
        this.__scrollToTabEl(newTab.$el)
      }
    },

    __scrollToTabEl (el) {
      const
        contentRef = this.$refs.content,
        { left, width, top, height } = contentRef.getBoundingClientRect(),
        newPos = el.getBoundingClientRect()

      let offset = this.vertical === true ? newPos.top - top : newPos.left - left

      if (offset < 0) {
        contentRef[ this.vertical === true ? 'scrollTop' : 'scrollLeft' ] += Math.floor(offset)
        this.__localUpdateArrows()
        return
      }

      offset += this.vertical === true ? newPos.height - height : newPos.width - width
      if (offset > 0) {
        contentRef[ this.vertical === true ? 'scrollTop' : 'scrollLeft' ] += Math.ceil(offset)
        this.__localUpdateArrows()
      }
    },

    __updateArrowsFn () {
      const content = this.$refs.content
      if (content !== null) {
        const
          rect = content.getBoundingClientRect(),
          pos = this.vertical === true ? content.scrollTop : Math.abs(content.scrollLeft)

        if (this.isRTL === true) {
          this.leftArrow = Math.ceil(pos + rect.width) < content.scrollWidth - 1
          this.rightArrow = pos > 0
        }
        else {
          this.leftArrow = pos > 0
          this.rightArrow = this.vertical === true
            ? Math.ceil(pos + rect.height) < content.scrollHeight
            : Math.ceil(pos + rect.width) < content.scrollWidth
        }
      }
    },

    __animScrollTo (value) {
      this.__stopAnimScroll()
      this.scrollTimer = setInterval(() => {
        if (this.__scrollTowards(value) === true) {
          this.__stopAnimScroll()
        }
      }, 5)
    },

    __scrollToStart () {
      this.__animScrollTo(this.rtlPosCorrection === true ? Number.MAX_SAFE_INTEGER : 0)
    },

    __scrollToEnd () {
      this.__animScrollTo(this.rtlPosCorrection === true ? 0 : Number.MAX_SAFE_INTEGER)
    },

    __stopAnimScroll () {
      clearInterval(this.scrollTimer)
    },

    // used by children
    __onKbdNavigate (keyCode, fromEl) {
      const tabs = Array.prototype.filter.call(
        this.$refs.content.children,
        el => el === fromEl || (el.matches && el.matches('.q-tab.q-focusable') === true)
      )

      const len = tabs.length
      if (len === 0) { return }

      if (keyCode === 36) { // Home
        this.__scrollToTabEl(tabs[ 0 ])
        return true
      }
      if (keyCode === 35) { // End
        this.__scrollToTabEl(tabs[ len - 1 ])
        return true
      }

      const dirPrev = keyCode === (this.vertical === true ? 38 /* ArrowUp */ : 37 /* ArrowLeft */)
      const dirNext = keyCode === (this.vertical === true ? 40 /* ArrowDown */ : 39 /* ArrowRight */)

      const dir = dirPrev === true ? -1 : (dirNext === true ? 1 : void 0)

      if (dir !== void 0) {
        const rtlDir = this.isRTL === true ? -1 : 1
        const index = tabs.indexOf(fromEl) + dir * rtlDir

        if (index >= 0 && index < len) {
          this.__scrollToTabEl(tabs[ index ])
          tabs[ index ].focus({ preventScroll: true })
        }

        return true
      }
    },

    __scrollTowards (value) {
      const
        content = this.$refs.content,
        { get, set } = this.posFn

      let
        done = false,
        pos = get(content)

      const direction = value < pos ? -1 : 1

      pos += direction * 5

      if (pos < 0) {
        done = true
        pos = 0
      }
      else if (
        (direction === -1 && pos <= value) ||
        (direction === 1 && pos >= value)
      ) {
        done = true
        pos = value
      }

      set(content, pos)
      this.__localUpdateArrows()

      return done
    },

    __getRouteList () {
      return this.tabList.filter(tab => tab.hasRouterLink === true && tab.linkRoute !== null)
    },

    // do not use directly; use __verifyRouteModel() instead
    __updateActiveRoute () {
      let name = null, wasActive = this.localFromRoute

      const
        best = { matchedLen: 0, hrefLen: 0, exact: false, found: false },
        { hash } = this.$route,
        model = this.currentModel

      let wasItActive = wasActive === true
        ? emptyFn
        : tab => {
          if (model === tab.name) {
            wasActive = true
            wasItActive = emptyFn
          }
        }

      const tabList = this.__getRouteList()

      for (const tab of tabList) {
        const exact = tab.exact === true

        if (
          tab[ exact === true ? 'linkIsExactActive' : 'linkIsActive' ] !== true ||
          (best.exact === true && exact !== true)
        ) {
          wasItActive(tab)
          continue
        }

        const { route: tabRoute, href } = tab.linkRoute
        const tabHash = tabRoute.hash

        // Vue Router does not match the hash too, even if link is set to "exact"
        if (exact === true) {
          if (hash === tabHash) {
            name = tab.name
            break
          }
          else if (hash !== '' && tabHash !== '') {
            wasItActive(tab)
            continue
          }
        }

        const matchedLen = tabRoute.matched.length
        const hrefLen = href.length - tabHash.length

        if (
          matchedLen === best.matchedLen
            ? hrefLen > best.hrefLen
            : matchedLen > best.matchedLen
        ) {
          name = tab.name
          Object.assign(best, { matchedLen, hrefLen, exact })
          continue
        }

        wasItActive(tab)
      }

      if (wasActive === true || name !== null) {
        this.__updateModel({ name, setCurrent: true, fromRoute: true })
      }
    },

    __onFocusin (e) {
      this.__removeFocusTimeout()

      if (
        this.hasFocus !== true &&
        this.$el &&
        e.target &&
        typeof e.target.closest === 'function'
      ) {
        const tab = e.target.closest('.q-tab')

        // if the target is contained by a QTab/QRouteTab
        // (it might be other elements focused, like additional QBtn)
        if (tab && this.$el.contains(tab) === true) {
          this.hasFocus = true
        }
      }

      this.qListeners.focusin !== void 0 && this.$emit('focusin', e)
    },

    __onFocusout (e) {
      this.__registerFocusTimeout(() => { this.hasFocus = false }, 30)
      this.qListeners.focusout !== void 0 && this.$emit('focusout', e)
    },

    // used by children
    __verifyRouteModel () {
      if (this.avoidRouteWatcher !== true) {
        this.__registerScrollToTabTimeout(this.__updateActiveRoute)
      }
    },

    __watchRoute () {
      if (this.unwatchRoute === void 0) {
        const unwatch = this.$watch(() => this.$route.fullPath, this.__verifyRouteModel)
        this.unwatchRoute = () => {
          unwatch()
          this.unwatchRoute = void 0
        }
      }
    },

    // used by children
    __registerTab (getTab) {
      this.tabList.push(getTab)
      this.__recalculateScroll()

      if (this.__getRouteList().length !== 0) {
        this.__watchRoute()
        this.__verifyRouteModel()
      }
      else {
        // we should still position to the currently active tab (if any)
        this.__registerScrollToTabTimeout(() => {
          if (this.scrollable === true) {
            const value = this.currentModel
            const newTab = value !== void 0 && value !== null && value !== ''
              ? this.tabList.find(tab => tab.name === value)
              : null

            newTab && this.__scrollToTabEl(newTab.$el)
          }
        })
      }
    },

    /*
     * Vue has an aggressive diff (in-place replacement) so we cannot
     * ensure that the instance getting destroyed is the actual tab
     * reported here. As a result, we cannot use its name or check
     * if it's a route one to make the necessary updates. We need to
     * always check the existing list again and infer the changes.
     */
    // used by children
    __unregisterTab (tabData) {
      this.tabList.splice(this.tabList.indexOf(tabData), 1)
      this.__recalculateScroll()

      if (this.unwatchRoute !== void 0) {
        this.__getRouteList().length === 0 && this.unwatchRoute()
        this.__verifyRouteModel()
      }
    },

    __cleanup () {
      clearTimeout(this.animateTimer)
      this.__stopAnimScroll()
      this.unwatchRoute !== void 0 && this.unwatchRoute()
    }
  },

  created () {
    this.__useTick('__registerScrollTick')
    this.__useTick('__registerUpdateArrowsTick')
    this.__useTick('__registerAnimateTick')

    this.__useTimeout('__registerFocusTimeout', '__removeFocusTimeout')
    this.__useTimeout('__registerScrollToTabTimeout')

    Object.assign(this, {
      tabList: [],
      localFromRoute: false,

      __localUpdateArrows: this.arrowsEnabled === true
        ? this.__updateArrowsFn
        : noop
    })
  },

  activated () {
    this.hadRouteWatcher === true && this.__watchRoute()
    this.__recalculateScroll()
  },

  deactivated () {
    this.hadRouteWatcher = this.unwatchRoute !== void 0
    this.__cleanup()
  },

  beforeDestroy () {
    this.__cleanup()
  },

  render (h) {
    const child = [
      h(QResizeObserver, {
        on: cache(this, 'resize', { resize: this.__updateContainer })
      }),

      h('div', {
        ref: 'content',
        class: this.innerClass,
        on: this.arrowsEnabled === true ? cache(this, 'scroll', { scroll: this.__updateArrowsFn }) : void 0
      }, slot(this, 'default'))
    ]

    this.arrowsEnabled === true && child.push(
      h(QIcon, {
        class: 'q-tabs__arrow q-tabs__arrow--start absolute q-tab__icon' +
            (this.leftArrow === true ? '' : ' q-tabs__arrow--faded'),
        props: { name: this.leftIcon || this.$q.iconSet.tabs[ this.vertical === true ? 'up' : 'left' ] },
        on: cache(this, 'onS', {
          '&mousedown': this.__scrollToStart,
          '&touchstart': this.__scrollToStart,
          '&mouseup': this.__stopAnimScroll,
          '&mouseleave': this.__stopAnimScroll,
          '&touchend': this.__stopAnimScroll
        })
      }),

      h(QIcon, {
        class: 'q-tabs__arrow q-tabs__arrow--end absolute q-tab__icon' +
            (this.rightArrow === true ? '' : ' q-tabs__arrow--faded'),
        props: { name: this.rightIcon || this.$q.iconSet.tabs[ this.vertical === true ? 'down' : 'right' ] },
        on: cache(this, 'onE', {
          '&mousedown': this.__scrollToEnd,
          '&touchstart': this.__scrollToEnd,
          '&mouseup': this.__stopAnimScroll,
          '&mouseleave': this.__stopAnimScroll,
          '&touchend': this.__stopAnimScroll
        })
      })
    )

    return h('div', {
      class: this.classes,
      on: this.onEvents,
      attrs: { role: 'tablist' }
    }, child)
  }
})
