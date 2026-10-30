<script lang="ts">
	import type { Option } from '$lib/regions';

	let {
		id,
		name,
		options,
		value = $bindable(''),
		placeholder = 'Select…',
		invalid = false,
		onchange
	}: {
		id: string;
		name: string;
		options: Option[];
		value?: string;
		placeholder?: string;
		invalid?: boolean;
		onchange?: (value: string) => void;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let root = $state<HTMLDivElement>();
	let list = $state<HTMLUListElement>();

	const selected = $derived(options.find((o) => o.value === value));
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase() === q
		);
	});

	function show() {
		open = true;
		query = '';
		active = Math.max(0, options.findIndex((o) => o.value === value));
		queueMicrotask(scrollToActive);
	}

	function choose(option: Option) {
		value = option.value;
		open = false;
		query = '';
		onchange?.(option.value);
	}

	function scrollToActive() {
		list?.children[active]?.scrollIntoView({ block: 'nearest' });
	}

	function onkeydown(event: KeyboardEvent) {
		if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
			event.preventDefault();
			show();
			return;
		}
		if (!open) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = Math.min(filtered.length - 1, Math.max(0, active + step));
			scrollToActive();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (filtered[active]) choose(filtered[active]);
		} else if (event.key === 'Escape' || event.key === 'Tab') {
			open = false;
		}
	}

	function onfocusout(event: FocusEvent) {
		if (!root?.contains(event.relatedTarget as Node)) open = false;
	}
</script>

<div class="picker" bind:this={root} {onfocusout}>
	<input type="hidden" {name} {value} />
	<div class="control" class:invalid>
		{#if selected?.icon && !open}<span class="icon" aria-hidden="true">{selected.icon}</span>{/if}
		<input
			{id}
			type="text"
			role="combobox"
			autocomplete="off"
			aria-expanded={open}
			aria-controls="{id}-list"
			aria-activedescendant={open && filtered[active] ? `${id}-${filtered[active].value}` : undefined}
			aria-invalid={invalid}
			placeholder={selected?.label ?? placeholder}
			value={open ? query : (selected?.label ?? '')}
			oninput={(e) => {
				query = e.currentTarget.value;
				active = 0;
				open = true;
			}}
			onclick={() => (open ? (open = false) : show())}
			{onkeydown}
		/>
		<span class="caret" aria-hidden="true"></span>
	</div>
	{#if open}
		<ul class="menu" id="{id}-list" role="listbox" bind:this={list}>
			{#each filtered as option, i (option.value)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-{option.value}"
					role="option"
					aria-selected={option.value === value}
					class:active={i === active}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => choose(option)}
					onmousemove={() => (active = i)}
				>
					{#if option.icon}<span class="icon" aria-hidden="true">{option.icon}</span>{/if}
					{option.label}
				</li>
			{:else}
				<li class="empty">No matches</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.picker {
		position: relative;
	}
	.control {
		position: relative;
		display: flex;
		align-items: center;
	}
	.control .icon {
		position: absolute;
		left: 0.85rem;
		font-size: 1.1rem;
		pointer-events: none;
	}
	.control:has(.icon) input {
		padding-left: 2.6rem;
	}
	.control input {
		width: 100%;
		font: inherit;
		font-size: 1rem;
		color: var(--ink);
		background: var(--bg-2);
		border: 2px solid var(--line);
		border-radius: 10px;
		padding: 0.6rem 2.4rem 0.6rem 0.85rem;
		outline: none;
		transition: border-color 0.12s ease;
		cursor: var(--cursor-pointer);
	}
	.control input:focus {
		border-color: var(--ink);
	}
	.control.invalid input {
		border-color: var(--accent);
	}
	.caret {
		position: absolute;
		right: 1rem;
		width: 0.55rem;
		height: 0.55rem;
		border-right: 2px solid var(--ink-soft);
		border-bottom: 2px solid var(--ink-soft);
		transform: translateY(-25%) rotate(45deg);
		pointer-events: none;
	}
	.menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		max-height: 16rem;
		overflow-y: auto;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 10px;
		box-shadow: 4px 5px 0 var(--shadow);
	}
	.menu li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		border-radius: 7px;
		cursor: var(--cursor-pointer);
	}
	.menu li.active {
		background: var(--note);
	}
	.menu li[aria-selected='true'] {
		font-weight: 700;
	}
	.menu li.empty {
		color: var(--ink-soft);
		cursor: default;
	}
</style>
