import { Transition, TransitionGroup, defineComponent, h } from "vue";

export default defineComponent({
  name: "DropTransition",
  props: {
    group: Boolean,
    delay: { type: Number, default: 0 },
    duration: { type: Number, default: 0.25 },
    appear: Boolean,
  },
  setup(props, { slots }) {
    const setStyle = (el) => {
      el.style.transition = `transform ${props.duration}s ease-in-out ${props.delay}s, opacity ${props.duration}s ease-in-out ${props.delay}s`;
      el.style.transform = "translateY(-20px)";
      el.style.opacity = "0";
    };
    const enter = (el) => {
      void el.offsetHeight;
      el.style.transform = "translateY(0)";
      el.style.opacity = "1";
    };
    return () => h(props.group ? TransitionGroup : Transition, {
      name: "drop",
      appear: props.appear,
      onBeforeAppear: setStyle,
      onAppear: enter,
      onBeforeEnter: setStyle,
      onEnter: enter,
      onBeforeLeave: setStyle,
    }, () => slots.default());
  },
});
