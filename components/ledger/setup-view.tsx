"use client";

import {
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Avatar } from "@/components/ledger/avatar";
import { InfoSheet } from "@/components/ledger/info-sheet";
import {
  ChipInput,
  ChipUnitContext,
  describePerChip,
  formatCents,
  PriceInput,
  useMoney,
} from "@/components/ledger/money";
import { rebuyRulesError, RebuyRulesFields } from "@/components/ledger/rebuy-rules";
import { Segmented } from "@/components/ledger/segmented";
import { describeMaxRebuys } from "@/lib/poker/buy-ins";
import {
  bigBlindAtLevel,
  DEFAULT_BLIND_SCHEDULE,
  isValidRakePercent,
  isValidSmallBlind,
  RAKE_PERCENTS,
  smallBlindFor,
} from "@/lib/poker/game";
import {
  chipCurrency,
  type ChipUnit,
  currencySymbol,
  formatChips,
} from "@/lib/poker/money";
import { MAX_CHIP_VALUE_CENTS } from "@/lib/poker/settle-up";
import {
  bigBlindChoices,
  chipUnitFor,
  DEFAULT_STACK,
  defaultBigBlind,
  fromUnit,
  inUnit,
  smallBlindShare as smallBlindShareOf,
  STACK_PRESETS,
} from "@/lib/poker/stakes";
import type {
  BlindSchedule,
  ChipValue,
  PlayerProfile,
  RakeRules,
  RebuyRules,
} from "@/lib/poker/types";

export function SetupView({
  kind,
  players,
  selfPlayerId,
  loading,
  error,
  onRetry,
  suggestedName,
  onStart,
}: {
  /** The kind of game this sets up, chosen on Home. */
  kind: "hands" | "ledger";
  players: PlayerProfile[];
  /** Your own player, listed first and marked You. */
  selfPlayerId: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  suggestedName: string;
  onStart: (input: {
    /** How the game is recorded: hand by hand, or a quick ledger. */
    kind: "hands" | "ledger";
    name: string;
    chipUnit: ChipUnit;
    stack: number;
    ante: number;
    smallBlind: number | null;
    blinds: BlindSchedule | null;
    rebuyRules: RebuyRules | null;
    bigBlindAnte: boolean;
    rakeRules: RakeRules | null;
    chipValue: ChipValue | null;
    players: PlayerProfile[];
    buyIns: number[] | null;
    randomDealer: boolean;
  }) => void;
}) {
  const { currency } = useMoney();
  // Chip value: off, a chip is one unit of the currency, as always; on, a
  // buy-in of the starting stack costs `buyInPrice` hundredths, and chip
  // amounts in this form show as plain counts.
  const [chipValueOn, setChipValueOn] = useState(false);
  const [buyInPrice, setBuyInPrice] = useState<number | null>(null);
  const [showChipValueHelp, setShowChipValueHelp] = useState(false);
  const chipsCode = chipCurrency(currency, chipValueOn) ?? currency;
  const symbol = currencySymbol(chipsCode);
  // Every amount in this form is in hundredths, so 0.25 and 10,000 use the
  // same boxes. The game's chip unit follows from them when it starts
  // (lib/poker/stakes.ts); nobody picks it.
  const money = (value: number) => formatChips(value, "cents", chipsCode);
  const ledger = kind === "ledger";
  const [name, setName] = useState("");
  const [stack, setStack] = useState(DEFAULT_STACK);
  const [ante, setAnte] = useState(() => defaultBigBlind(DEFAULT_STACK));
  const [risingBlinds, setRisingBlinds] = useState(false);
  const [blindUnit, setBlindUnit] = useState<BlindSchedule["unit"]>(
    DEFAULT_BLIND_SCHEDULE.unit,
  );
  const [blindEvery, setBlindEvery] = useState(DEFAULT_BLIND_SCHEDULE.every);
  const [blindRaiseType, setBlindRaiseType] = useState<
    BlindSchedule["raiseType"]
  >(DEFAULT_BLIND_SCHEDULE.raiseType);
  const [blindRaiseBy, setBlindRaiseBy] = useState(
    DEFAULT_BLIND_SCHEDULE.raiseBy,
  );
  const [customStack, setCustomStack] = useState(false);
  // Own amounts: each player can buy in for a different amount, with the
  // starting stack as the default. Typed amounts are kept by player.
  const [ownAmounts, setOwnAmounts] = useState(false);
  const [seatAmounts, setSeatAmounts] = useState<Record<string, number>>({});
  const [showOwnAmountsHelp, setShowOwnAmountsHelp] = useState(false);
  const [customAnte, setCustomAnte] = useState(false);
  // Odd blinds: off keeps the usual half. A chip picks a share of the big
  // blind, so it follows big blind changes; Other is a fixed amount.
  const [oddBlinds, setOddBlinds] = useState(false);
  const [smallBlindShare, setSmallBlindShare] = useState(40);
  const [customSmallBlind, setCustomSmallBlind] = useState(false);
  const [smallBlindAmount, setSmallBlindAmount] = useState(4_000);
  const [rebuyRules, setRebuyRules] = useState<RebuyRules>({
    maxRebuys: null,
    closeAtBigBlind: null,
  });
  const [bigBlindAnte, setBigBlindAnte] = useState(false);
  const [rakeOn, setRakeOn] = useState(false);
  const [rakePercent, setRakePercent] = useState<number>(5);
  // Other: a typed percent, 0.1 to 10 in steps of 0.1.
  const [customRake, setCustomRake] = useState(false);
  // The cap follows the big blind (three of them) until it is typed in.
  const [typedRakeCap, setTypedRakeCap] = useState<number | null>(null);
  // Tapping players seats them in tap order; the list below reorders them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const playerCount = selectedIds.length;
  // On, the first dealer is drawn only when the game starts, so nobody
  // sees it during setup; off, seat 1 deals first.
  const [randomDealer, setRandomDealer] = useState(true);
  const seatListRef = useRef<HTMLDivElement>(null);
  const seatDragRef = useRef<{
    pointerId: number;
    from: number;
    over: number | null;
    row: HTMLElement;
    rowCenters: number[];
    rowStep: number;
    startScrollY: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const seatDropAnimationRef = useRef<{
    row: HTMLElement;
    fromRect: DOMRect;
  } | null>(null);
  const seatScrollFrameRef = useRef<number | null>(null);
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const [dropSeat, setDropSeat] = useState<number | null>(null);
  const [seatDragStep, setSeatDragStep] = useState(0);
  const [showDealerHelp, setShowDealerHelp] = useState(false);
  const [showAnteHelp, setShowAnteHelp] = useState(false);
  const [showRakeHelp, setShowRakeHelp] = useState(false);
  const [showOddBlindsHelp, setShowOddBlindsHelp] = useState(false);

  useEffect(() => () => {
    if (seatScrollFrameRef.current !== null) {
      cancelAnimationFrame(seatScrollFrameRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    const landing = seatDropAnimationRef.current;
    if (!landing) return;
    seatDropAnimationRef.current = null;
    // The rows that stepped aside during the drag lose that shift in the
    // same render that moves them to their new places, so the two cancel
    // out. Without this their slide transition would replay the removed
    // shift from the new place: a jump of one seat, then a slide back.
    const rows = [
      ...(seatListRef.current?.querySelectorAll<HTMLElement>(".seat-row") ?? []),
    ];
    for (const row of rows) row.style.transition = "none";
    landing.row.style.removeProperty("transform");
    const toRect = landing.row.getBoundingClientRect();
    requestAnimationFrame(() => {
      for (const row of rows) row.style.removeProperty("transition");
    });
    if (
      typeof landing.row.animate !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Compare centres: the lifted row was scaled up, so its corner is off.
    const dx =
      landing.fromRect.left + landing.fromRect.width / 2 -
      (toRect.left + toRect.width / 2);
    const dy =
      landing.fromRect.top + landing.fromRect.height / 2 -
      (toRect.top + toRect.height / 2);
    landing.row.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1.03)` },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      { duration: 190, easing: "cubic-bezier(.2, .8, .2, 1)" },
    );
  }, [selectedIds]);

  const schedule: BlindSchedule | null = risingBlinds
    ? {
        unit: blindUnit,
        every: blindEvery,
        raiseType: blindRaiseType,
        raiseBy: blindRaiseBy,
      }
    : null;
  const scheduleValid =
    !schedule ||
    (schedule.every >= 1 &&
      schedule.raiseBy > (schedule.raiseType === "multiply" ? 1 : 0));
  // The game's unit, from every amount typed or picked (all in hundredths).
  const amountFor = (playerId: string) => seatAmounts[playerId] ?? stack;
  // A quick ledger has only buy-ins, so the blind amounts don't count.
  const chipUnit = chipUnitFor(stack, [
    ...(ownAmounts ? selectedIds.map(amountFor) : []),
    ...(ledger
      ? []
      : [
          ante,
          risingBlinds && blindRaiseType === "add" ? blindRaiseBy : null,
          rebuyRules.closeAtBigBlind,
          oddBlinds && customSmallBlind ? smallBlindAmount : null,
        ]),
  ]);
  /** The plan in the game's unit, which rounds its levels like the game will. */
  const scheduleInUnit = (plan: BlindSchedule | null) =>
    plan?.raiseType === "add"
      ? { ...plan, raiseBy: inUnit(plan.raiseBy, chipUnit) }
      : plan;
  const ladder = schedule && scheduleValid
    ? Array.from({ length: 4 }, (_, level) =>
        fromUnit(
          bigBlindAtLevel(
            inUnit(Math.max(1, ante), chipUnit),
            scheduleInUnit(schedule),
            level,
          ),
          chipUnit,
        ),
      )
    : [];

  function toggleSeat(playerId: string) {
    setSelectedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : current.length >= MAX_SEATS
          ? current
          : [...current, playerId],
    );
  }

  /**
   * A new stack brings its usual big blind (100 big blinds deep) and drops
   * amounts picked for the old one, so 50 and 0.50 never sit beside 50K.
   */
  function chooseStack(next: number) {
    const bigBlind = defaultBigBlind(next);
    setStack(next);
    setAnte(bigBlind);
    setCustomAnte(false);
    setCustomSmallBlind(false);
    setSmallBlindAmount(smallBlindFor(bigBlind));
    if (blindRaiseType === "add") setBlindRaiseBy(bigBlind);
    setRebuyRules((rules) => ({ ...rules, closeAtBigBlind: null }));
  }

  function chooseBlindLevels(choice: "fixed" | BlindSchedule["unit"]) {
    if (choice === "fixed") {
      setRisingBlinds(false);
      return;
    }
    if (!risingBlinds || blindUnit !== choice) {
      setBlindEvery(choice === "hands" ? 10 : 20);
    }
    setRisingBlinds(true);
    setBlindUnit(choice);
  }

  function moveSeat(from: number, to: number) {
    if (from === to) return;
    setSelectedIds((current) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= current.length ||
        to >= current.length
      ) {
        return current;
      }
      const next = [...current];
      const [playerId] = next.splice(from, 1);
      next.splice(to, 0, playerId);
      return next;
    });
  }

  function updateSeatDropTarget(drag: NonNullable<typeof seatDragRef.current>) {
    const list = seatListRef.current;
    const bounds = list?.getBoundingClientRect();
    let over: number | null = null;
    if (
      list &&
      bounds &&
      drag.x >= bounds.left - 32 &&
      drag.x <= bounds.right + 32 &&
      drag.y >= bounds.top - 16 &&
      drag.y <= bounds.bottom + 16
    ) {
      let nearestDistance = Infinity;
      const scrollDelta = window.scrollY - drag.startScrollY;
      drag.rowCenters.forEach((center, index) => {
        const distance = Math.abs(drag.y - (center - scrollDelta));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          over = index;
        }
      });
    }
    if (drag.over !== over) {
      drag.over = over;
      setDropSeat(over);
    }
  }

  function positionDraggedSeat(drag: NonNullable<typeof seatDragRef.current>) {
    // Vertical only: a row pushed past the screen's side edge widens the
    // page, and phones zoom out to fit it, which moves the fixed tab bar
    // and leaves it there after the drop.
    const y = drag.y - drag.startY + window.scrollY - drag.startScrollY;
    drag.row.style.transform = `translate3d(0, ${y}px, 0) scale(1.03)`;
  }

  function scrollWhileDragging() {
    seatScrollFrameRef.current = null;
    const drag = seatDragRef.current;
    if (!drag?.moved) return;
    const edge = 72;
    const distanceFromBottom = window.innerHeight - drag.y;
    const step =
      drag.y < edge
        ? -Math.max(4, Math.ceil((edge - drag.y) / 5))
        : distanceFromBottom < edge
          ? Math.max(4, Math.ceil((edge - distanceFromBottom) / 5))
          : 0;
    if (step === 0) return;
    const bounds = seatListRef.current?.getBoundingClientRect();
    if (
      !bounds ||
      (step < 0 && bounds.top >= drag.y) ||
      (step > 0 && bounds.bottom <= drag.y)
    ) {
      return;
    }
    const previousScroll = window.scrollY;
    window.scrollBy(0, step);
    if (window.scrollY === previousScroll) return;
    positionDraggedSeat(drag);
    updateSeatDropTarget(drag);
    seatScrollFrameRef.current = requestAnimationFrame(scrollWhileDragging);
  }

  function stopSeatScroll() {
    if (seatScrollFrameRef.current !== null) {
      cancelAnimationFrame(seatScrollFrameRef.current);
      seatScrollFrameRef.current = null;
    }
  }

  function startSeatDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (
      !selectedIds[index] ||
      loading ||
      error ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }
    const list = seatListRef.current;
    const row = event.currentTarget.closest<HTMLElement>(".seat-row");
    if (!list || !row) return;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-seat-index]")];
    const rowGap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
    seatDragRef.current = {
      pointerId: event.pointerId,
      from: index,
      over: index,
      row,
      rowCenters: rows.map((item) => {
        const rect = item.getBoundingClientRect();
        return (rect.top + rect.bottom) / 2;
      }),
      rowStep: row.getBoundingClientRect().height + rowGap,
      startScrollY: window.scrollY,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = seatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
    ) {
      return;
    }
    if (!drag.moved) {
      // Follow the finger from the first move: the "is-dragging" class that
      // also turns the slide off only arrives with the next render.
      drag.row.style.transition = "none";
      setDraggingSeat(drag.from);
      setDropSeat(drag.from);
      setSeatDragStep(drag.rowStep);
    }
    drag.moved = true;
    positionDraggedSeat(drag);
    updateSeatDropTarget(drag);
    if (seatScrollFrameRef.current === null) {
      seatScrollFrameRef.current = requestAnimationFrame(scrollWhileDragging);
    }
  }

  function endSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = seatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopSeatScroll();
    if (drag.moved && drag.over !== null && drag.over !== drag.from) {
      seatDropAnimationRef.current = {
        row: drag.row,
        fromRect: drag.row.getBoundingClientRect(),
      };
      moveSeat(drag.from, drag.over);
    } else {
      drag.row.style.removeProperty("transform");
      drag.row.style.removeProperty("transition");
    }
    seatDragRef.current = null;
    setDraggingSeat(null);
    setDropSeat(null);
    setSeatDragStep(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelSeatDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (seatDragRef.current?.pointerId !== event.pointerId) return;
    stopSeatScroll();
    seatDragRef.current.row.style.removeProperty("transform");
    seatDragRef.current.row.style.removeProperty("transition");
    seatDragRef.current = null;
    setDraggingSeat(null);
    setDropSeat(null);
    setSeatDragStep(0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedPlayers = selectedIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is PlayerProfile => Boolean(player));
    if (
      playerCount < 2 ||
      selectedPlayers.length !== playerCount ||
      new Set(selectedPlayers.map((player) => player.id)).size !== playerCount
    ) {
      return;
    }
    const closeAt = setupRebuyRules.closeAtBigBlind;
    onStart({
      kind,
      chipValue: setupChipValue,
      bigBlindAnte,
      rakeRules: rakeOn
        ? {
            percent: Math.round(rakePercent * 10) / 10,
            cap: inUnit(rakeCap, chipUnit),
          }
        : null,
      name,
      chipUnit,
      stack: inUnit(stack, chipUnit),
      ante: inUnit(ante, chipUnit),
      smallBlind: smallBlind === null ? null : inUnit(smallBlind, chipUnit),
      blinds: scheduleInUnit(schedule),
      rebuyRules: {
        ...setupRebuyRules,
        closeAtBigBlind: closeAt === null ? null : inUnit(closeAt, chipUnit),
      },
      players: selectedPlayers,
      buyIns: ownAmounts
        ? selectedIds.map((id) => inUnit(amountFor(id), chipUnit))
        : null,
      randomDealer,
    });
  }

  const amountsValid =
    !ownAmounts || selectedIds.every((id) => amountFor(id) >= 1);
  const setupChipValue: ChipValue | null =
    chipValueOn && buyInPrice
      ? { chips: inUnit(stack, chipUnit), cents: buyInPrice }
      : null;
  const chipValueValid =
    !chipValueOn ||
    (buyInPrice !== null &&
      buyInPrice >= 1 &&
      buyInPrice <= MAX_CHIP_VALUE_CENTS);
  const selectionComplete =
    playerCount >= 2 &&
    playerCount <= MAX_SEATS &&
    new Set(selectedIds).size === playerCount;
  const nameFor = (playerId: string) =>
    players.find((player) => player.id === playerId)?.name ?? "";
  const stackPreset = STACK_PRESETS.includes(stack);
  const anteChoices = bigBlindChoices(stack);
  const antePreset = anteChoices.includes(ante);
  const smallBlindOptions = SMALL_BLIND_SHARES.map((percent) => ({
    percent,
    amount: smallBlindShareOf(Math.max(1, ante), percent, chipUnit),
  })).filter(
    (option, index, all) =>
      all.findIndex((other) => other.amount === option.amount) === index,
  );
  const sharedSmallBlind =
    smallBlindOptions.find((option) => option.percent === smallBlindShare) ??
    smallBlindOptions[0];
  const smallBlind = oddBlinds
    ? customSmallBlind
      ? smallBlindAmount
      : sharedSmallBlind.amount
    : null;
  const smallBlindValid =
    smallBlind === null || isValidSmallBlind(smallBlind, ante);
  // A closing big blind only means something while the blinds rise.
  const setupRebuyRules: RebuyRules = {
    maxRebuys: rebuyRules.maxRebuys,
    closeAtBigBlind:
      schedule && rebuyRules.maxRebuys !== 0
        ? rebuyRules.closeAtBigBlind
        : null,
  };
  const rebuyError = rebuyRulesError(
    setupRebuyRules,
    0,
    Math.max(1, ante),
    money,
  );
  const rebuyCloseOptions = ladder.slice(1);
  const rakeCap = typedRakeCap ?? Math.max(1, ante) * 3;
  const rakeCapValid = !rakeOn || rakeCap >= 1;
  const rakePercentValid = !rakeOn || isValidRakePercent(rakePercent);
  const blindLevelNote = !risingBlinds
    ? "Blinds stay fixed"
    : !scheduleValid
      ? "Check the blind plan"
      : blindRaiseType === "multiply" && blindRaiseBy === 2
        ? "Big blind doubles each level"
        : blindRaiseType === "multiply"
          ? `Big blind ×${blindRaiseBy} each level`
          : `Big blind +${money(blindRaiseBy)} each level`;

  return (
    <ChipUnitContext.Provider value="cents">
      <form className="stack-list setup-view" onSubmit={submit}>
        <section className="glass card">
          <label className="label" htmlFor="game-name">
            Game name <span className="label-note">(Optional)</span>
          </label>
          <input
            className="field"
            id="game-name"
            maxLength={80}
            placeholder={suggestedName}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </section>

        <section className="glass card">
          <div className="card-row">
            <span className="label">Select players</span>
          </div>
          {error ? (
            <div className="inline-state">
              <span>{error}</span>
              <button type="button" className="text-button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <p className="muted">Loading players…</p>
          ) : players.length ? (
            <div className="seat-chips">
              {[
                ...players.filter((player) => player.id === selfPlayerId),
                ...players.filter((player) => player.id !== selfPlayerId),
              ].map((player) => {
                const seat = selectedIds.indexOf(player.id);
                const full = seat < 0 && playerCount >= MAX_SEATS;
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`seat-chip ${seat >= 0 ? "seated" : ""}`}
                    aria-pressed={seat >= 0}
                    disabled={full}
                    onClick={() => toggleSeat(player.id)}
                  >
                    <span className="seat-chip-dot" aria-hidden="true">
                      {seat >= 0 ? seat + 1 : "+"}
                    </span>
                    {player.name}
                    {player.id === selfPlayerId ? (
                      <span className="you-tag">You</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!loading && !error && players.length < 2 ? (
            <p className="muted">Add at least two players before starting a game.</p>
          ) : null}
          {playerCount > 1 ? (
            <>
              <div className="card-row seat-order-heading">
                <span className="label">{ledger ? "Players" : "Seating Order"}</span>
                {ledger ? null : (
                  <div className="heading-with-info">
                    <label className="switch-row">
                      <span>Randomize dealer</span>
                      <button
                        className="switch"
                        type="button"
                        role="switch"
                        aria-checked={randomDealer}
                        aria-label="Randomize dealer"
                        onClick={() => setRandomDealer((on) => !on)}
                      />
                    </label>
                    <button
                      className="info-button"
                      type="button"
                      aria-label="About randomize dealer"
                      onClick={() => setShowDealerHelp(true)}
                    >
                      i
                    </button>
                  </div>
                )}
              </div>
              {showDealerHelp ? (
                <InfoSheet
                  label="About randomize dealer"
                  onClose={() => setShowDealerHelp(false)}
                >
                  <p>
                    <b>Randomize Dealer On:</b> the first dealer is chosen at
                    random when the game starts.
                  </p>
                  <p>
                    <b>Randomize Dealer Off:</b> seat 1 deals first.
                  </p>
                </InfoSheet>
              ) : null}
              <div className="seat-order-list" ref={seatListRef}>
                {selectedIds.map((selectedId, index) => {
                  let shift = 0;
                  if (draggingSeat !== null && dropSeat !== null) {
                    if (
                      draggingSeat < dropSeat &&
                      index > draggingSeat &&
                      index <= dropSeat
                    ) {
                      shift = -seatDragStep;
                    } else if (
                      draggingSeat > dropSeat &&
                      index >= dropSeat &&
                      index < draggingSeat
                    ) {
                      shift = seatDragStep;
                    }
                  }
                  const seatName = nameFor(selectedId);
                  return (
                    <div
                      className={`seat-row${draggingSeat === index ? " is-dragging" : ""}${
                        draggingSeat !== null &&
                        dropSeat === index &&
                        draggingSeat !== index
                          ? " is-drop-target"
                          : ""
                      }`}
                      data-seat-index={index}
                      key={selectedId}
                      style={
                        shift
                          ? { transform: `translate3d(0, ${shift}px, 0)` }
                          : undefined
                      }
                    >
                      {ledger ? null : (
                        <span className="seat-number" aria-hidden="true">
                          {index + 1}
                        </span>
                      )}
                      <Avatar name={seatName} playerId={selectedId} size="small" />
                      <span className="seat-name">{seatName}</span>
                      {ownAmounts ? (
                        <ChipInput
                          className={`field seat-amount${
                            amountFor(selectedId) >= 1 ? "" : " invalid"
                          }`}
                          aria-label={`${seatName}'s buy-in`}
                          value={amountFor(selectedId)}
                          onChange={(chips) =>
                            setSeatAmounts((amounts) => ({
                              ...amounts,
                              [selectedId]: chips,
                            }))
                          }
                        />
                      ) : null}
                      {ledger ? null : (
                        <button
                          className="seat-drag-handle"
                          type="button"
                          disabled={loading || Boolean(error)}
                          aria-label={`Move seat ${index + 1}, ${seatName}. Drag or use arrow keys.`}
                          onPointerDown={(event) => startSeatDrag(event, index)}
                          onPointerMove={moveSeatDrag}
                          onPointerUp={endSeatDrag}
                          onPointerCancel={cancelSeatDrag}
                          onLostPointerCapture={cancelSeatDrag}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp" && index > 0) {
                              event.preventDefault();
                              moveSeat(index, index - 1);
                            } else if (
                              event.key === "ArrowDown" &&
                              index < playerCount - 1
                            ) {
                              event.preventDefault();
                              moveSeat(index, index + 1);
                            }
                          }}
                        >
                          <span aria-hidden="true">⠿</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>

        <section className="glass card">
          <div className="card-row">
            <span className="label">{ledger ? "Buy-in" : "Starting stack"}</span>
            <div className="heading-with-info">
              <label className="switch-row">
                <span>Own amounts</span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={ownAmounts}
                  aria-label="Own amounts"
                  onClick={() => setOwnAmounts((on) => !on)}
                />
              </label>
              <button
                className="info-button"
                type="button"
                aria-label="About own amounts"
                onClick={() => setShowOwnAmountsHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          {showOwnAmountsHelp ? (
            <InfoSheet
              label="About own amounts"
              onClose={() => setShowOwnAmountsHelp(false)}
            >
              <p>
                <b>Own Amounts Off:</b> everyone buys in for the same amount.
              </p>
              <p>
                <b>Own Amounts On:</b> each player can buy in for a different
                amount.
              </p>
            </InfoSheet>
          ) : null}
          <Segmented
            label="Starting stack"
            columns={6}
            options={[
              ...STACK_PRESETS.map((value) => ({
                value,
                label: compactAmount(value),
              })),
              { value: "other" as const, label: "Other" },
            ]}
            value={customStack || !stackPreset ? "other" : stack}
            onChange={(value) => {
              if (value === "other") {
                setCustomStack(true);
              } else {
                setCustomStack(false);
                chooseStack(value);
              }
            }}
          />
          {customStack || !stackPreset ? (
            <ChipInput
              className="field"
              id="stack"
              aria-label="Starting stack amount"
              value={stack}
              onChange={chooseStack}
            />
          ) : null}
          <p className="muted small-note">
            {ownAmounts
              ? `Each player buys in for ${money(stack)} unless you change their amount in the ${
                  ledger ? "player list" : "seating order"
                }.`
              : `Everyone buys in for ${money(stack)}.`}
          </p>
          {ownAmounts && !amountsValid ? (
            <p className="field-error" role="alert">
              Every player&apos;s buy-in must be more than 0.
            </p>
          ) : null}
        </section>

        {ledger ? null : (
          <>
            <section className="glass card">
              <div className="card-row">
                <span className="label">Big blind</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>Odd blinds</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={oddBlinds}
                      aria-label="Odd blinds"
                      onClick={() => setOddBlinds((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About odd blinds"
                    onClick={() => setShowOddBlindsHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showOddBlindsHelp ? (
                <InfoSheet
                  label="About odd blinds"
                  onClose={() => setShowOddBlindsHelp(false)}
                >
                  <p>
                    <b>Odd Blinds Off:</b> the small blind is half the big blind.
                  </p>
                  <p>
                    <b>Odd Blinds On:</b> you choose the small blind.
                  </p>
                </InfoSheet>
              ) : null}
              <Segmented
                label="Big blind"
                options={[
                  ...anteChoices.map((value) => ({ value, label: money(value) })),
                  { value: "other" as const, label: "Other" },
                ]}
                value={customAnte || !antePreset ? "other" : ante}
                onChange={(value) => {
                  if (value === "other") {
                    setCustomAnte(true);
                  } else {
                    setCustomAnte(false);
                    setAnte(value);
                  }
                }}
              />
              {customAnte || !antePreset ? (
                <ChipInput
                  className="field"
                  id="ante"
                  aria-label="Big blind amount"
                  value={ante}
                  onChange={setAnte}
                />
              ) : null}
              {oddBlinds ? (
                <>
                  <span className="label">Small blind</span>
                  <Segmented
                    label="Small blind"
                    options={[
                      ...smallBlindOptions.map((option) => ({
                        value: option.amount,
                        label: money(option.amount),
                      })),
                      { value: "other" as const, label: "Other" },
                    ]}
                    value={customSmallBlind ? "other" : sharedSmallBlind.amount}
                    onChange={(value) => {
                      if (value === "other") {
                        setCustomSmallBlind(true);
                        setSmallBlindAmount(sharedSmallBlind.amount);
                        return;
                      }
                      setCustomSmallBlind(false);
                      const picked = smallBlindOptions.find(
                        (option) => option.amount === value,
                      );
                      if (picked) setSmallBlindShare(picked.percent);
                    }}
                  />
                  {customSmallBlind ? (
                    <ChipInput
                      className="field"
                      aria-label="Small blind amount"
                      value={smallBlindAmount}
                      onChange={setSmallBlindAmount}
                    />
                  ) : null}
                  {smallBlindValid ? null : (
                    <p className="field-error" role="alert">
                      The small blind must be from {money(1)} up to the big blind.
                    </p>
                  )}
                </>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Blind levels</span>
                <span className="card-note">{blindLevelNote}</span>
              </div>
              <Segmented
                label="Blind levels"
                options={[
                  { value: "fixed", label: "Fixed" },
                  { value: "hands", label: "By Hands" },
                  { value: "minutes", label: "By Minutes" },
                ]}
                value={risingBlinds ? blindUnit : "fixed"}
                onChange={chooseBlindLevels}
              />
              {risingBlinds ? (
                <>
                  <Segmented
                    label="How the big blind rises"
                    options={[
                      { value: "multiply", label: "Multiply" },
                      { value: "add", label: "Add fixed amount" },
                    ]}
                    value={blindRaiseType}
                    onChange={(nextType) => {
                      setBlindRaiseType(nextType);
                      setBlindRaiseBy(
                        nextType === "multiply" ? 2 : Math.max(1, ante),
                      );
                    }}
                  />
                  <div className="field-grid">
                    <div>
                      <label className="label" htmlFor="blind-every">
                        Every ({blindUnit})
                      </label>
                      <input
                        className="field"
                        id="blind-every"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={blindEvery}
                        onChange={(event) =>
                          setBlindEvery(Number(event.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="blind-raise-by">
                        {blindRaiseType === "multiply" ? "Multiply by" : `Add ${symbol.trim()}`}
                      </label>
                      {blindRaiseType === "multiply" ? (
                        <input
                          className="field"
                          id="blind-raise-by"
                          type="number"
                          inputMode="decimal"
                          min="1.1"
                          step="0.1"
                          value={blindRaiseBy}
                          onChange={(event) =>
                            setBlindRaiseBy(Number(event.target.value))
                          }
                        />
                      ) : (
                        <ChipInput
                          className="field"
                          id="blind-raise-by"
                          value={blindRaiseBy}
                          onChange={setBlindRaiseBy}
                        />
                      )}
                    </div>
                  </div>
                  <p className="muted small-note">
                    {scheduleValid ? (
                      <>
                        Big blind: {ladder
                          .map((bigBlind) => money(bigBlind))
                          .join(", ")}
                        , …
                        {blindUnit === "minutes"
                          ? " Timed levels apply when the next hand is dealt."
                          : ""}
                      </>
                    ) : (
                      <>
                        Set an interval of at least 1 and an increase that makes the
                        blinds bigger.
                      </>
                    )}
                  </p>
                </>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Rebuys</span>
                <span className="card-note">
                  {describeMaxRebuys(setupRebuyRules.maxRebuys)}
                </span>
              </div>
              <RebuyRulesFields
                rules={rebuyRules}
                onChange={setRebuyRules}
                closeOptions={rebuyCloseOptions}
                showClose={Boolean(schedule) && scheduleValid}
                idPrefix="setup"
              />
              {rebuyError ? (
                <p className="field-error" role="alert">
                  {rebuyError}
                </p>
              ) : (
                <p className="muted small-note">
                  A busted player can buy back in for{" "}
                  {ownAmounts ? "any amount, usually " : "the starting stack, "}
                  {money(stack)}
                  {setupRebuyRules.maxRebuys === 0
                    ? ", but not in this game."
                    : setupRebuyRules.closeAtBigBlind !== null
                      ? `, until the big blind reaches ${money(
                          setupRebuyRules.closeAtBigBlind,
                        )}.`
                      : "."}
                </p>
              )}
            </section>
          </>
        )}

        <section className="glass card">
          <div className="card-row">
            <span className="label">Chip value</span>
            <div className="heading-with-info">
              <label className="switch-row">
                <span>Chips cost money</span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={chipValueOn}
                  aria-label="Chips cost money"
                  onClick={() => setChipValueOn((on) => !on)}
                />
              </label>
              <button
                className="info-button"
                type="button"
                aria-label="About chip value"
                onClick={() => setShowChipValueHelp(true)}
              >
                i
              </button>
            </div>
          </div>
          {showChipValueHelp ? (
            <InfoSheet
              label="About chip value"
              onClose={() => setShowChipValueHelp(false)}
            >
              <p>
                <b>Chips Cost Money On:</b> say what a buy-in costs, for
                example {formatCents(50_000, currency)} for 10,000 chips. The
                table counts chips; results and Settle up show money at that
                price.
              </p>
              <p>
                <b>Chips Cost Money Off:</b> one chip is{" "}
                {formatCents(100, currency)}. You can set a price later from
                Settle up on the saved game.
              </p>
            </InfoSheet>
          ) : null}
          {chipValueOn ? (
            <>
              <label className="label" htmlFor="buy-in-price">
                A {money(stack)}-chip buy-in costs
              </label>
              <PriceInput
                id="buy-in-price"
                label="What a buy-in costs"
                value={buyInPrice}
                onChange={setBuyInPrice}
              />
              {chipValueValid && setupChipValue ? (
                <p className="muted small-note">
                  {describePerChip(setupChipValue, chipUnit, currency)}. Results
                  and Settle up show money at this price.
                </p>
              ) : (
                <p className="muted small-note">
                  Enter what a buy-in costs.
                </p>
              )}
            </>
          ) : null}
        </section>

        {/* Usually off, so they come last (user request 2026-10-13). */}
        {ledger ? null : (
          <>
            <section className="glass card">
              <div className="card-row">
                <span className="label">Ante</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>Big blind ante</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={bigBlindAnte}
                      aria-label="Big blind ante"
                      onClick={() => setBigBlindAnte((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About the big blind ante"
                    onClick={() => setShowAnteHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showAnteHelp ? (
                <InfoSheet
                  label="About the big blind ante"
                  onClose={() => setShowAnteHelp(false)}
                >
                  <p>
                    <b>Big Blind Ante On:</b> each hand the big blind also puts in
                    an ante of one big blind for the whole table. It goes to the
                    main pot and doesn&apos;t count toward their bet.
                  </p>
                  <p>
                    <b>Big Blind Ante Off:</b> no ante, only the blinds.
                  </p>
                </InfoSheet>
              ) : null}
              {bigBlindAnte ? (
                <p className="muted small-note">
                  Each hand the big blind also puts in an ante of one big blind (
                  {money(Math.max(1, ante))} to start) for the whole table. It goes
                  to the main pot and doesn&apos;t count toward their bet.
                </p>
              ) : null}
            </section>

            <section className="glass card">
              <div className="card-row">
                <span className="label">Rake</span>
                <div className="heading-with-info">
                  <label className="switch-row">
                    <span>House rake</span>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={rakeOn}
                      aria-label="House rake"
                      onClick={() => setRakeOn((on) => !on)}
                    />
                  </label>
                  <button
                    className="info-button"
                    type="button"
                    aria-label="About the house rake"
                    onClick={() => setShowRakeHelp(true)}
                  >
                    i
                  </button>
                </div>
              </div>
              {showRakeHelp ? (
                <InfoSheet
                  label="About the house rake"
                  onClose={() => setShowRakeHelp(false)}
                >
                  <p>
                    <b>House Rake On:</b> the house takes a share of each pot that
                    sees a flop, up to the most per hand. No flop, no rake. The
                    rake leaves the game, so results add up to minus it.
                  </p>
                  <p>
                    <b>House Rake Off:</b> no rake, every chip stays with the
                    players.
                  </p>
                </InfoSheet>
              ) : null}
              {rakeOn ? (
                <>
                  <Segmented
                    label="Share of each pot"
                    columns={5}
                    options={[
                      ...RAKE_PERCENTS.map((percent) => ({
                        value: percent,
                        label: `${percent}%`,
                      })),
                      { value: "other" as const, label: "Other" },
                    ]}
                    value={customRake ? "other" : rakePercent}
                    onChange={(value) => {
                      if (value === "other") {
                        setCustomRake(true);
                      } else {
                        setCustomRake(false);
                        setRakePercent(value);
                      }
                    }}
                  />
                  {customRake ? (
                    <div className="percent-field">
                      <input
                        className="field"
                        id="rake-percent"
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="10"
                        step="0.1"
                        aria-label="Rake percent"
                        value={Number.isFinite(rakePercent) ? rakePercent : ""}
                        onChange={(event) =>
                          setRakePercent(Number(event.target.value))
                        }
                      />
                      <span aria-hidden="true">%</span>
                    </div>
                  ) : null}
                  <label className="label" htmlFor="rake-cap">
                    Most per hand
                  </label>
                  <div className="money-field">
                    <span aria-hidden="true">{symbol.trim()}</span>
                    <ChipInput
                      className="field"
                      id="rake-cap"
                      value={rakeCap}
                      onChange={setTypedRakeCap}
                    />
                  </div>
                </>
              ) : null}
              {rakeOn && !rakePercentValid ? (
                <p className="field-error" role="alert">
                  Rake must be 0.1% to 10%, in steps of 0.1.
                </p>
              ) : rakeOn && !rakeCapValid ? (
                <p className="field-error" role="alert">
                  Set the most the house takes in a hand.
                </p>
              ) : rakeOn ? (
                <p className="muted small-note">
                  The house takes {rakePercent}% of each pot that sees a flop, up to{" "}
                  {money(rakeCap)} a hand. No flop, no rake. The rake leaves the
                  game, so results add up to minus it.
                </p>
              ) : null}
            </section>
          </>
        )}

        <button
          className="cta"
          type="submit"
          disabled={
            !selectionComplete ||
            !amountsValid ||
            !chipValueValid ||
            stack < 1 ||
            (!ledger &&
              (ante < 1 ||
                !scheduleValid ||
                !smallBlindValid ||
                !rakeCapValid ||
                !rakePercentValid ||
                Boolean(rebuyError)))
          }
        >
          {ledger ? "Start Quick Ledger" : "Deal First Hand"}
        </button>
      </form>
    </ChipUnitContext.Provider>
  );
}

const MAX_SEATS = 10;

/** A stack chip's label from hundredths: "20", "500", "1K", "50K". */
function compactAmount(hundredths: number) {
  const amount = hundredths / 100;
  return amount >= 1_000 ? `${amount / 1_000}K` : String(amount);
}
/** Odd small blind chips, as percentages of the big blind (100: 25–100). */
const SMALL_BLIND_SHARES = [25, 40, 60, 75, 100] as const;
