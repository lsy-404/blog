<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFrontmatter, useSiteLocaleData } from 'vuepress/client'
import worldArt from './home-art/home-world.webp'
import atmosphere from './home-art/home-atmosphere.webp'
import city from './home-art/home-city.webp'
import clouds from './home-art/home-clouds.webp'
import foreground from './home-art/home-foreground.webp'
import glowFar from './home-art/home-glow-far.webp'
import glowNear from './home-art/home-glow-near.webp'

const HOME_WORLD = worldArt
const HOME_WORLD_LAYERS = { atmosphere, city, clouds, foreground, glowFar, glowNear }

const frontmatter = useFrontmatter()
const siteLocale = useSiteLocaleData()
const collapsed = ref(false)
let viewportHeight = 0

type WorldLayer = {
  key: string
  src: string
  depthX: number
  depthY: number
  scale: number
  idleFromX: string
  idleFromY: string
  idleToX: string
  idleToY: string
}

const world = ref<HTMLElement | null>(null)
const layersReady = ref(false)
const layers: WorldLayer[] = [
  { key: 'sky', src: HOME_WORLD, depthX: 1.5, depthY: 1, scale: 1.01, idleFromX: '-1px', idleFromY: '0px', idleToX: '1px', idleToY: '-1px' },
  { key: 'clouds-far', src: HOME_WORLD_LAYERS.atmosphere, depthX: 4, depthY: 2.5, scale: 0.96, idleFromX: '-2px', idleFromY: '1px', idleToX: '2px', idleToY: '-1px' },
  { key: 'glow-far', src: HOME_WORLD_LAYERS.glowFar, depthX: 5, depthY: 3, scale: 1, idleFromX: '-3px', idleFromY: '2px', idleToX: '3px', idleToY: '-2px' },
  { key: 'glow-near', src: HOME_WORLD_LAYERS.glowNear, depthX: 5, depthY: 3, scale: 1, idleFromX: '-3px', idleFromY: '2px', idleToX: '3px', idleToY: '-2px' },
  { key: 'city', src: HOME_WORLD_LAYERS.city, depthX: 8, depthY: 5, scale: 0.98, idleFromX: '-4px', idleFromY: '2px', idleToX: '4px', idleToY: '-2px' },
  { key: 'clouds-near', src: HOME_WORLD_LAYERS.clouds, depthX: 12, depthY: 7, scale: 1, idleFromX: '5px', idleFromY: '-3px', idleToX: '-5px', idleToY: '3px' },
  { key: 'foreground', src: HOME_WORLD_LAYERS.foreground, depthX: 17, depthY: 11, scale: 1.02, idleFromX: '-6px', idleFromY: '4px', idleToX: '6px', idleToY: '-4px' },
  { key: 'atmosphere', src: HOME_WORLD_LAYERS.atmosphere, depthX: 21, depthY: 14, scale: 1.04, idleFromX: '-7px', idleFromY: '4px', idleToX: '7px', idleToY: '-4px' },
]

let layerElements: HTMLElement[] = []
let finePointerQuery: MediaQueryList | null = null
let reducedMotionQuery: MediaQueryList | null = null
let animationFrame = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0

function layerStyle(layer: WorldLayer, index: number) {
  const idleDelay = layer.key === 'glow-far' || layer.key === 'glow-near' ? -0.9 : index * -0.9
  return {
    '--layer-scale': String(layer.scale),
    '--layer-delay': `${index * 70}ms`,
    '--idle-delay': `${idleDelay}s`,
    '--idle-from-x': layer.idleFromX,
    '--idle-from-y': layer.idleFromY,
    '--idle-to-x': layer.idleToX,
    '--idle-to-y': layer.idleToY,
  }
}

function applyTransforms(x: number, y: number) {
  layerElements.forEach((element, index) => {
    const layer = layers[index]
    if (!layer) return
    element.style.setProperty('--shift-x', `${(x * layer.depthX).toFixed(2)}px`)
    element.style.setProperty('--shift-y', `${(-y * layer.depthY).toFixed(2)}px`)
  })
}

function animateTowardPointer() {
  const ease = 0.075
  currentX += (targetX - currentX) * ease
  currentY += (targetY - currentY) * ease
  applyTransforms(currentX, currentY)

  if (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001) {
    animationFrame = requestAnimationFrame(animateTowardPointer)
  } else {
    currentX = targetX
    currentY = targetY
    applyTransforms(currentX, currentY)
    animationFrame = 0
  }
}

function scheduleAnimation() {
  if (!animationFrame) animationFrame = requestAnimationFrame(animateTowardPointer)
}

function resetPointer() {
  targetX = 0
  targetY = 0
  scheduleAnimation()
}

function handlePointerMove(event: PointerEvent) {
  const element = world.value
  if (!element || !finePointerQuery?.matches || reducedMotionQuery?.matches) return

  const rect = element.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    resetPointer()
    return
  }

  targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2))
  targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2))
  scheduleAnimation()
}

function handlePointerOut(event: PointerEvent) {
  if (!event.relatedTarget) resetPointer()
}

function handleResize() {
  viewportHeight = window.innerHeight
}

function handleScroll() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  if (scrollTop < viewportHeight * 0.1) collapsed.value = false
  else if (scrollTop < viewportHeight * 0.3) collapsed.value = true
}

function toggleHero() {
  if (collapsed.value) {
    collapsed.value = false
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    collapsed.value = true
  }
}

function handleMotionPreference() {
  if (!reducedMotionQuery?.matches) return
  cancelAnimationFrame(animationFrame)
  animationFrame = 0
  targetX = 0
  targetY = 0
  currentX = 0
  currentY = 0
  applyTransforms(0, 0)
}

onMounted(() => {
  layerElements = Array.from(world.value?.querySelectorAll<HTMLElement>('[data-landing-layer]') ?? [])
  finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionQuery.addEventListener('change', handleMotionPreference)
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerout', handlePointerOut)
  window.addEventListener('blur', resetPointer)
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleResize()
  // Mount the decorative layers after the first frame so only the sky image gates the largest paint.
  requestAnimationFrame(() => setTimeout(() => {
    layersReady.value = true
    requestAnimationFrame(() => {
      layerElements = Array.from(world.value?.querySelectorAll<HTMLElement>('[data-landing-layer]') ?? [])
      applyTransforms(currentX, currentY)
    })
  }))
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  reducedMotionQuery?.removeEventListener('change', handleMotionPreference)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerout', handlePointerOut)
  window.removeEventListener('blur', resetPointer)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <section ref="world" class="landing-world" :class="{ 'landing-world--collapsed': collapsed }">
    <h1 class="landing-world__title">{{ frontmatter.heroText || siteLocale.title }}</h1>
    <div class="landing-world__scene" aria-hidden="true">
    <template v-for="(layer, index) in layers" :key="layer.key">
      <div
        v-if="index === 0 || layersReady"
        class="landing-world__layer"
        :class="[`landing-world__layer--${layer.key}`, { 'landing-world__layer--deferred': index > 0 }]"
        :style="layerStyle(layer, index)"
        :data-landing-layer="layer.key"
      >
        <img class="landing-world__art" :src="layer.src" alt="" draggable="false" :fetchpriority="index === 0 ? 'high' : undefined" />
      </div>
    </template>
    </div>
    <button
      class="landing-world__toggle"
      :class="{ 'landing-world__toggle--flipped': collapsed }"
      type="button"
      :aria-expanded="!collapsed"
      aria-label="Toggle hero"
      @click="toggleHero"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true">
        <path d="M108.775 312.23c13.553 0 27.106 3.734 39.153 11.806l375.205 250.338 363.641-252.808c32.587-21.624 76.499-12.83 98.123 19.757 21.685 32.467 12.95 76.56-19.576 98.184l-402.854 278.89c-23.733 15.901-54.694 15.962-78.547.12L69.501 442.097c-32.647-21.685-41.441-65.777-19.817-98.304 13.734-20.54 36.201-31.563 59.09-31.563Z" />
      </svg>
    </button>
  </section>
</template>

<style scoped>
.landing-world__title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.landing-world {
  position: relative;
  height: calc(100vh - var(--navbar-height));
  height: calc(100svh - var(--navbar-height));
  margin-bottom: 1rem;
  overflow: hidden;
  user-select: none;
  background: #14233f;
  contain: paint;
  transition: height 1s ease;
}

.landing-world--collapsed { height: 350px; }

.landing-world__scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.landing-world__toggle {
  position: absolute;
  bottom: 0;
  left: 50%;
  z-index: 2;
  width: 60px;
  height: 60px;
  padding: 10px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, .8);
  cursor: pointer;
  filter: drop-shadow(gray 0 0 3px);
  transform: translateX(-50%) rotate(180deg);
  transition: transform .2s ease;
}

.landing-world__toggle--flipped { transform: translateX(-50%); }

.landing-world__toggle:focus-visible { outline: 2px solid white; outline-offset: 3px; }

.landing-world__layer {
  --shift-x: 0px;
  --shift-y: 0px;
  position: absolute;
  inset: -5%;
  display: grid;
  place-items: center;
  opacity: 1;
  transform: translate3d(var(--shift-x), var(--shift-y), 0) scale(var(--layer-scale));
  transform-origin: center;
  will-change: transform;
}

.landing-world__layer--deferred .landing-world__art {
  animation: landing-layer-in .6s ease-out var(--layer-delay) both;
}

@keyframes landing-layer-in {
  from { opacity: 0; }
}

.landing-world__art {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  -webkit-user-drag: none;
}

.landing-world__layer--clouds-far .landing-world__art {
  opacity: 0.66;
}

.landing-world__layer--clouds-near .landing-world__art {
  opacity: 0.86;
}

.landing-world__layer--atmosphere .landing-world__art {
  opacity: 0.32;
}

.landing-world__layer--glow-far,
.landing-world__layer--glow-near {
  inset: 0;
}

.landing-world__layer--glow-far .landing-world__art,
.landing-world__layer--glow-near .landing-world__art {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(136vmin, 100vw);
  height: min(136vmin, 100vw);
  translate: -50% -50%;
  object-fit: contain;
  opacity: 0.68;
}

.landing-world__layer--glow-far .landing-world__art {
  animation: landing-glow-clockwise 58s linear infinite;
}

.landing-world__layer--glow-near .landing-world__art {
  width: min(52vmin, 40vw);
  height: min(52vmin, 40vw);
  opacity: 0.76;
  animation: landing-glow-counterclockwise 46s linear infinite;
}

.landing-world__layer--deferred.landing-world__layer--glow-far .landing-world__art {
  animation: landing-layer-in .6s ease-out var(--layer-delay) both, landing-glow-clockwise 58s linear infinite;
}

.landing-world__layer--deferred.landing-world__layer--glow-near .landing-world__art {
  animation: landing-layer-in .6s ease-out var(--layer-delay) both, landing-glow-counterclockwise 46s linear infinite;
}

@keyframes landing-glow-clockwise {
  to { transform: rotate(360deg); }
}

@keyframes landing-glow-counterclockwise {
  to { transform: rotate(-360deg); }
}

@keyframes landing-touch-drift {
  from { transform: translate3d(var(--idle-from-x), var(--idle-from-y), 0) scale(var(--layer-scale)); }
  to { transform: translate3d(var(--idle-to-x), var(--idle-to-y), 0) scale(var(--layer-scale)); }
}

@media (hover: none), (pointer: coarse) {
  .landing-world__layer {
    animation: landing-touch-drift 13s ease-in-out var(--idle-delay) infinite alternate;
  }
}

@media (max-width: 768px) {
  .landing-world--collapsed { height: 240px; }
}

@media (max-width: 700px) {
  .landing-world__art {
    object-position: 59% center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-world__layer,
  .landing-world__layer--deferred .landing-world__art,
  .landing-world__layer--glow-far .landing-world__art,
  .landing-world__layer--glow-near .landing-world__art {
    opacity: 1;
    animation: none;
  }

  .landing-world__layer {
    transform: scale(var(--layer-scale));
  }
}
</style>
