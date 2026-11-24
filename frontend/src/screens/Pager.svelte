<script>
  // Set logging as a pager: one page per exercise of today, in Today's order. Swipe the page
  // body (or use the arrows) to move between them; moving changes nothing. The route
  // (#/log/<id>) is the current page, replaced rather than pushed, so Home and the back gesture
  // both return to Today in one step from any page, with any sheet open.
  import { untrack } from 'svelte';
  import ExercisePage from '../components/ExercisePage.svelte';
  import Icon from '../components/Icon.svelte';
  import ItemPage from '../components/ItemPage.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { dragAxis, swipeMayStart, swipeTarget } from '../logic.js';
  import { replace } from '../router.svelte.js';
  import { loggedCount, pageInfo, pages, plannedSets } from '../stores/workout.svelte.js';

  let { id } = $props();

  const list = $derived(pages());
  const index = $derived(Math.max(0, list.findIndex((p) => p.id === id)));
  // The current page and its neighbors are rendered; keyed, so a page keeps its typed values
  // while it slides in and out.
  const shown = $derived(list.slice(Math.max(0, index - 1), index + 2));
  const base = $derived(index === 0 ? 0 : 1); // where the current page sits among `shown`

  let width = $state(360);
  let offset = $state(0); // px the track is dragged by
  let animating = $state(false);
  let listOpen = $state(false);
  let drag = null;
  let swallowClick = false;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goTo(k) {
    if (k < 0 || k >= list.length) return;
    replace(`/log/${list[k].id}`);
  }

  function settle(target) {
    const dir = target - index;
    if (reduced() || !dir) {
      offset = 0;
      goTo(target);
      return;
    }
    animating = true;
    offset = -dir * width;
    setTimeout(() => {
      animating = false;
      offset = 0;
      goTo(target);
    }, 210);
  }

  // Swipes start only on a page body, away from the screen edges, and never on steppers,
  // inputs or the RIR picker.
  function down(event) {
    if (animating || event.button > 0) return;
    const t = event.target;
    if (!t.closest('.pager-body') || t.closest('input, textarea, .hr-stepper, .hr-rir, [data-noswipe]')) return;
    if (!swipeMayStart(event.clientX, window.innerWidth)) return;
    drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, t: event.timeStamp, v: 0, axis: null };
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    if (!drag.axis) {
      drag.axis = dragAxis(dx, event.clientY - drag.y0);
      if (drag.axis === 'y') {
        drag = null; // a scroll: leave it to the browser
        return;
      }
      if (drag.axis === 'x') event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (drag.axis !== 'x') return;
    const dt = event.timeStamp - drag.t;
    if (dt > 0) drag.v = (event.clientX - drag.x) / dt;
    drag.x = event.clientX;
    drag.t = event.timeStamp;
    const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1);
    offset = atEnd ? dx / 3 : dx;
  }

  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.axis !== 'x') return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    settle(swipeTarget(index, list.length, offset, width, d.v));
  }

  function cancel() {
    if (drag?.axis === 'x') settle(index);
    drag = null;
  }

  // A swipe that ends over a button must not also press it.
  function click(event) {
    if (swallowClick) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  function jump(k) {
    listOpen = false;
    goTo(k);
  }

  // The route can also change from outside (back or forward); drop any half-finished drag.
  $effect(() => {
    void id;
    untrack(() => {
      drag = null;
      if (!animating) offset = 0;
    });
  });

  function statusText(info) {
    if (info.status === 'done') return 'Done';
    if (info.status === 'stopped') return 'Stopped';
    if (info.status === 'skipped') return 'Skipped';
    if (info.slot && !info.item) {
      const n = loggedCount(info.slot);
      return n ? `${n} of ${plannedSets(info.slot)} sets` : 'Not started';
    }
    return 'Not ticked yet';
  }
</script>

<div class="pager">
  <header class="pager-top">
    <a href="#/" class="hr-btn hr-btn--ghost hr-btn--compact pager-home"><Icon name="calendar" />Today</a>
    <div class="pager-nav">
      <button class="hr-icon-btn" aria-label="Previous exercise" disabled={index === 0} onclick={() => goTo(index - 1)}>
        <span class="flip"><Icon name="chevron-right" /></span>
      </button>
      <button
        class="pager-count hr-num"
        aria-label="Exercise {index + 1} of {list.length}. Show all exercises"
        aria-haspopup="dialog"
        onclick={() => (listOpen = true)}
      >
        {index + 1} of {list.length}
      </button>
      <button class="hr-icon-btn" aria-label="Next exercise" disabled={index === list.length - 1} onclick={() => goTo(index + 1)}>
        <Icon name="chevron-right" />
      </button>
    </div>
    <span></span>
  </header>

  <div class="pager-view" bind:clientWidth={width}>
    <!-- Swipe handling only: every control inside is a real button or link. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pager-track"
      class:pager-track--anim={animating}
      style:transform="translateX(calc({-base * 100}% + {offset}px))"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={cancel}
      onclickcapture={click}
    >
      {#each shown as page (page.id)}
        {@const current = page.id === list[index].id}
        {@const info = pageInfo(page)}
        <section class="pager-page" aria-label={info.name} aria-hidden={!current} inert={!current}>
          {#if info.item}
            <ItemPage {page} {current} />
          {:else}
            <ExercisePage slotId={page.id} {current} />
          {/if}
        </section>
      {/each}
    </div>
  </div>
</div>

{#if listOpen}
  <Sheet label="All of today's exercises" onclose={() => (listOpen = false)}>
    <div class="stack-tight">
      <span class="hr-eyebrow">Jump to</span>
      <h2 class="hr-sheet__title">Today's exercises</h2>
    </div>
    <div class="stack">
      {#each list as page, k (page.id)}
        {@const info = pageInfo(page)}
        <button class="hr-sheet__option" aria-current={k === index ? 'page' : undefined} onclick={() => jump(k)}>
          <span class="jump-n hr-num" aria-hidden="true">
            {#if info.status === 'done'}<Icon name="check" />
            {:else if info.status === 'stopped'}<Icon name="stop" />
            {:else if info.status === 'skipped'}<Icon name="skip" />
            {:else}{k + 1}{/if}
          </span>
          <span class="option-text">
            <span class="option-name">{info.name}</span>
            <span class="meta">{statusText(info)}</span>
          </span>
          {#if k === index}<span class="meta-strong">Here</span>{/if}
        </button>
      {/each}
    </div>
  </Sheet>
{/if}
