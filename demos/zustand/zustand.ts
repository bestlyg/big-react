import { useRef, useSyncExternalStore, useEffect, useMemo } from 'react';

export type SetState<T> = (
	partial: T | ((prevState: T) => T),
	replace?: boolean
) => void;

export type Listener<T> = (state: T, prevState: T) => void;

export interface StoreApi<T> {
	setState: SetState<T>;
	getState: () => T;
	subscribe: (listener: Listener<T>) => () => void;
}

export type StoreCreator<T> = (
	setState: StoreApi<T>['setState'],
	getState: StoreApi<T>['getState'],
	api: StoreApi<T>
) => T;

export function create<T>(createState: StoreCreator<T>) {
	return createImpl(createState);
}
export function createImpl<T>(createState: StoreCreator<T>) {
	const api = createStore(createState);

	const useBoundStore: any = (selector?: any, equalityFn?: any) =>
		useStore(api, selector, equalityFn);

	Object.assign(useBoundStore, api);

	return useBoundStore;
}

export function createStore<T>(createState: StoreCreator<T>) {
	let state: T;
	const listeners: Set<Listener<T>> = new Set();
	const setState: StoreApi<T>['setState'] = (partial, replace) => {
		const nextState =
			typeof partial === 'function'
				? (partial as (state: T) => T)(state)
				: partial;
		if (!Object.is(state, nextState)) {
			const prevState = state;
			state =
				replace ?? typeof nextState !== 'object'
					? nextState
					: Object.assign({}, state, nextState);
			listeners.forEach((fn) => fn(state, prevState));
		}
	};
	const getState: StoreApi<T>['getState'] = () => state;
	const subscribe: StoreApi<T>['subscribe'] = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const api: StoreApi<T> = { setState, getState, subscribe };
	state = createState(setState, getState, api);
	return api;
}

export function useStore<T, U>(
	api: StoreApi<T>,
	selector: (state: T) => U,
	equalityFn?: (a: U, b: U) => boolean
) {
	const slice = useSyncExternalStoreWithSelector(
		api.subscribe,
		api.getState,
		selector,
		equalityFn
	);
	return slice;
}

export function useSyncExternalStoreWithSelector<T, Selection>(
	subscribe: (listener: Listener<T>) => () => void,
	getSnapshot: () => T,
	selector: (snapshot: T) => Selection,
	isEqual?: (a: Selection, b: Selection) => boolean
) {
	type Instance =
		| { hasValue: true; value: Selection }
		| { hasValue: false; value: null }
		| null;

	const instRef = useRef<Instance>();

	let inst!: Instance;
	if (instRef.current === null) {
		instRef.current = inst = {
			hasValue: false,
			value: null
		};
	} else {
		inst = instRef.current;
	}

	const [getSelection] = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot!: T;
		let memoizedSelection!: Selection;
		const memoizedSelector = (nextSnapshot: T) => {
			const prevSnapshot = memoizedSnapshot;
			const prevSelection = memoizedSelection;
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;
				const nextSelection = selector(nextSnapshot);

				if (isEqual !== undefined) {
					if (inst!.hasValue) {
						const currentSelection = inst!.value;
						memoizedSelection = currentSelection;
						return currentSelection;
					}
				}

				memoizedSelection = nextSelection;
				return nextSelection;
			}

			if (Object.is(prevSnapshot, nextSnapshot)) {
				return prevSelection;
			}

			const nextSelection = selector(nextSnapshot);

			if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
				return prevSelection;
			}

			memoizedSnapshot = nextSnapshot;
			memoizedSelection = nextSelection;
			return nextSelection;
		};
		const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
		return [getSnapshotWithSelector];
	}, [selector, isEqual, getSnapshot]);

	const value = useSyncExternalStore(subscribe, getSelection);
	useEffect(() => {
		inst!.hasValue = true;
		inst!.value = value;
	}, [value]);
	return value;
}
