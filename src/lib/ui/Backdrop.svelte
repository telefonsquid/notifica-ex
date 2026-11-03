<!-- Two soft color fields drifting slowly behind the logged out pages -->
<div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
	<div class="blob blob-accent absolute -top-1/4 -left-1/4 size-[70vmax] rounded-full"></div>
	<div class="blob blob-secondary absolute -right-1/4 -bottom-1/3 size-[60vmax] rounded-full"></div>
</div>

<style>
	.blob {
		filter: blur(90px);
		opacity: 0.55;
		animation: wander 26s var(--ease-in-out) infinite alternate;
	}

	.blob-accent {
		background: radial-gradient(circle, var(--theme-accent-soft), transparent 65%);
	}

	.blob-secondary {
		background: radial-gradient(circle, var(--theme-secondary-soft), transparent 65%);
		animation-duration: 32s;
		animation-direction: alternate-reverse;
	}

	@keyframes wander {
		from { translate: 0 0; scale: 1; }
		to { translate: 12vmax 8vmax; scale: 1.15; }
	}

	/* Phones keep the fields still, moving a 90px blur repaints the whole screen every frame */
	@media (prefers-reduced-motion: reduce), (pointer: coarse) {
		.blob { animation: none; }
	}
</style>
