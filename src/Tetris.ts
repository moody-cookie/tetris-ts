import { Clock } from './Clock.js'
import { Color, Display, getNextRandomColor, RenderPoint } from './Display.js'
import { Keyboard } from './Keyboard.js'
import { Options } from './Options.js'
import {
  getNextTetromino,
  getNextTetrominoRotation,
  Tetromino,
} from './tetrominoes.js'
import { Swipes } from './Swipes.js'
import { Tap } from './Tap.js'

const GRID_WIDTH = 10 // cell count horizontal
const GRID_HEIGHT = 20 // cell count vertical

const DEFAULT_COLOR = 'White'

const RANDOM_FILL_COUNT = 5

// game speed settings
const TIME_START = 300 // starting time to drop one block below
const TIME_END = 150
const TIME_MOD_COEFF = 0.95
const TIME_MOD_FREQ = 300000

const INITIAL_TETROMINO_POSITION = { x: 4, y: -1 }

// next tetromino display
const NEXT_TETROMINO_POSITION = { x: 2, y: 2 }
const NEXT_TETROMINO_CELL_SIZE = 12
const NEXT_TETROMINO_CELL_GAP = 1
const NEXT_TETROMINO_CELLS = { x: 6, y: 5 }

const SAVE_AND_LOAD_KEY = 'tetris:gameState'

enum Direction {
  Left = 'left',
  Right = 'right',
}

export class Tetris {
  private scoreContainer: HTMLElement

  private display: Display
  private nextBlockDisplay: Display
  private keyboard: Keyboard
  private clock: Clock
  private swipes: Swipes
  private tap: Tap

  private field: RenderPoint[] // current playing field, one to render
  private filledField: RenderPoint[] // field with filled cells

  private currentTetromino: Tetromino = getNextTetromino()
  private currentTetrominoPosition: RenderPoint = INITIAL_TETROMINO_POSITION
  private currentTetrominoRotation: number = getNextTetrominoRotation(
    this.currentTetromino
  )
  private currentColor: Color = getNextRandomColor()

  private nextTetromino: Tetromino = getNextTetromino()
  private nextColor: Color = getNextRandomColor()

  private score = 0

  // options
  private pause = false
  private options: Options
  private isColorOn: boolean = true
  private _difficulty: number = 0
  public isSpeedChanging: boolean = false
  private gameOver: boolean = false

  private isLastMove: boolean = false
  private isFirstMove: boolean = true

  constructor(container: HTMLElement) {
    // score system
    this.scoreContainer = document.querySelector('p#score')!
    this.renderScore()

    this.display = new Display(container, {
      cellWidth: GRID_WIDTH,
      cellHeight: GRID_HEIGHT,
      cellSize: 30,
      fitContainer: true,
    })
    this.nextBlockDisplay = new Display(
      document.querySelector('.next-tetromino')!,
      {
        cellHeight: NEXT_TETROMINO_CELLS.y,
        cellWidth: NEXT_TETROMINO_CELLS.x,
        cellGap: NEXT_TETROMINO_CELL_GAP,
        cellSize: NEXT_TETROMINO_CELL_SIZE,
      }
    )
    this.keyboard = new Keyboard()
    this.clock = new Clock()
    this.swipes = new Swipes()
    this.tap = new Tap()

    this.field = []
    this.filledField = []

    this.options = new Options(this)

    this.clock.addRenderCallback(this.render.bind(this))

    // main game logic
    const mainGameLogicCallback = {
      callback: this.game.bind(this),
      interval: Math.floor(TIME_START / TIME_MOD_COEFF), // to compensate initial call
    }
    // speed
    const changeSpeedCallback = {
      callback: () => {
        if (!this.isSpeedChanging) {
          mainGameLogicCallback.interval = TIME_START
          return
        }
        const newTime = Math.floor(
          mainGameLogicCallback.interval * TIME_MOD_COEFF
        )

        mainGameLogicCallback.interval = Math.max(newTime, TIME_END)
      },
      interval: TIME_MOD_FREQ,
    }

    const strafeLeftLogicCallback = {
      callback: this.strafeTetromino.bind(this, Direction.Left),
      interval: 150,
    }
    const strafeRightLogicCallback = {
      callback: this.strafeTetromino.bind(this, Direction.Right),
      interval: 150,
    }

    this.clock.addLogicCallback(mainGameLogicCallback)
    this.clock.addLogicCallback(changeSpeedCallback)

    // keyboard bindings
    this.keyboard.add({
      code: 'KeyA',
      keydownCallback: () => {
        this.strafeTetromino.bind(this, Direction.Left)
        this.clock.addLogicCallback(strafeLeftLogicCallback)
      },
      keyupCallback: () => {
        this.clock.removeLogicCallback(strafeLeftLogicCallback)
      },
    })
    this.keyboard.add({
      code: 'KeyD',
      keydownCallback: () => {
        this.strafeTetromino.bind(this, Direction.Right)
        this.clock.addLogicCallback(strafeRightLogicCallback)
      },
      keyupCallback: () => {
        this.clock.removeLogicCallback(strafeRightLogicCallback)
      },
    })
    this.keyboard.add({
      code: 'KeyW',
      keydownCallback: this.rotateTetromino.bind(this),
    })
    this.keyboard.add({
      code: 'KeyS',
      keydownCallback: this.pullFullTetromino.bind(this),
    })
    this.keyboard.add({
      code: 'Space',
      keydownCallback: this.togglePause.bind(this),
    })

    // swipe control

    this.swipes.addSwipeLeftCallback(
      this.strafeTetromino.bind(this, Direction.Left)
    )
    this.swipes.addSwipeRightCallback(
      this.strafeTetromino.bind(this, Direction.Right)
    )

    // tap control
    this.tap.addTopTapCallback(this.rotateTetromino.bind(this))
    this.tap.addBottomTapCallback(this.pullFullTetromino.bind(this))

    this.clock.start()
  }

  get currentTetrominoCoords() {
    return this.currentTetromino[this.currentTetrominoRotation]
  }

  get currentTetrominoAbsoluteCoords() {
    return this.currentTetrominoCoords.map((tetrominoeCoords) => ({
      x: tetrominoeCoords.x + this.currentTetrominoPosition.x,
      y: tetrominoeCoords.y + this.currentTetrominoPosition.y,
    }))
  }

  set difficulty(value: number) {
    const isValidValue = !isNaN(value) && value >= 0 && value <= 10
    this._difficulty = isValidValue ? value : 0
  }

  // game actions

  generateNextTetromino() {
    this.currentTetrominoPosition = INITIAL_TETROMINO_POSITION

    this.currentTetromino = this.nextTetromino
    this.currentColor = this.nextColor
    this.nextTetromino = getNextTetromino()
    this.nextColor = this.isColorOn ? getNextRandomColor() : DEFAULT_COLOR

    this.currentTetrominoRotation = getNextTetrominoRotation(
      this.currentTetromino
    )
  }

  strafeTetromino(direction: Direction) {
    if (this.pause || !this.checkCanStrafeTetromino(direction)) {
      return
    }

    const nextX =
      this.currentTetrominoPosition.x + (direction === Direction.Left ? -1 : 1)
    this.currentTetrominoPosition = {
      ...this.currentTetrominoPosition,
      x: nextX,
    }
  }

  // pulls tetromino down
  pullTetromino() {
    this.currentTetrominoPosition = {
      ...this.currentTetrominoPosition,
      y: this.currentTetrominoPosition.y + 1,
    }
  }

  rotateTetromino() {
    if (this.pause || !this.checkCanRotateTetromino()) {
      return
    }

    this.currentTetrominoRotation = getNextTetrominoRotation(
      this.currentTetromino,
      this.currentTetrominoRotation
    )
  }

  saveTetromino() {
    this.filledField = [
      ...this.filledField,
      ...this.currentTetrominoAbsoluteCoords.map((coords) => ({
        ...coords,
        color: this.currentColor,
      })),
    ]
  }

  destroyFilledRows() {
    const allY = Array(GRID_HEIGHT)
      .fill(null)
      .map((_, index) => index)

    let destroyedRows = 0
    for (const row of allY) {
      const filledCellsAmount = this.filledField.filter(
        ({ y }) => y === row
      ).length
      if (filledCellsAmount !== GRID_WIDTH) {
        continue
      }

      destroyedRows++

      this.filledField = this.filledField
        .filter(({ y }) => y !== row)
        .map((coords) =>
          coords.y > row ? coords : { ...coords, y: coords.y + 1 }
        )
    }

    this.addScore(destroyedRows)
  }

  addScore(destroyedRows: number) {
    switch (destroyedRows) {
      case 1:
        this.score += 40
        break
      case 2:
        this.score += 100
        break
      case 3:
        this.score += 300
        break
      case 4:
        this.score += 1200
    }
    if (destroyedRows !== 0) {
      this.renderScore()
    }
  }

  pullFullTetromino() {
    if (this.pause) {
      return
    }

    this.isFirstMove = false

    while (this.checkCanPullTetromino()) {
      this.pullTetromino()
    }
  }

  // control options logic

  restart() {
    this.score = 0
    this.gameOver = false
    this.pause = false
    this.isFirstMove = true
    this.options.toggle()
    this.#cleanField()
    this.#fillField()
    this.renderScore()
    this.generateNextTetromino()
  }

  #cleanField() {
    this.filledField = []
    this.field = []
  }

  #fillField() {
    for (let i = 0; i < this._difficulty; i++) {
      this.#fillRow(GRID_HEIGHT - 1 - i)
    }
  }

  #fillRow(row: number) {
    const generated: boolean[] = Array(GRID_WIDTH).fill(false)

    let filledAmount = 0
    let current = -1
    let filledStreak = 0
    while (filledAmount < RANDOM_FILL_COUNT) {
      current = (current + 1) % GRID_WIDTH

      if (generated[current]) {
        continue
      }
      const fillingHere = filledStreak < 2 && Math.random() > 0.5
      if (fillingHere) {
        generated[current] = true
        filledStreak++
        filledAmount++
      } else {
        filledStreak = 0
      }
    }

    const filtered = generated
      .map((e, i) => [e, i])
      .filter(([e]) => e)
      .map(([, i]) => i as number)

    this.filledField = this.filledField.concat(
      filtered.map((x: number) => ({
        x,
        y: row,
        color: getNextRandomColor(),
      }))
    )
  }

  switchColor(isColorOn: boolean) {
    this.isColorOn = isColorOn
    if (isColorOn) {
      this.currentColor = getNextRandomColor()
      this.filledField = this.filledField.map((coords) => ({
        ...coords,
        color: getNextRandomColor(),
      }))
    } else {
      this.currentColor = DEFAULT_COLOR
      this.filledField = this.filledField.map((coords) => ({
        ...coords,
        color: DEFAULT_COLOR,
      }))
    }
  }

  // game checks

  checkCanPullTetromino() {
    // find min y in tetromino
    const potentialPullAbsoluteCoords = this.currentTetrominoAbsoluteCoords.map(
      (coords) => ({ ...coords, y: coords.y + 1 })
    )

    return !potentialPullAbsoluteCoords.some(
      ({ x, y }) =>
        y >= GRID_HEIGHT ||
        this.filledField.some(
          ({ x: filledX, y: filledY }) => x === filledX && filledY === y
        )
    )
  }

  checkCanStrafeTetromino(direction: Direction) {
    switch (direction) {
      case Direction.Left:
        const potentialStrafeLeftCoords =
          this.currentTetrominoAbsoluteCoords.map((coords) => ({
            ...coords,
            x: coords.x - 1,
          }))
        return !potentialStrafeLeftCoords.some(
          ({ x, y }) =>
            x < 0 ||
            this.filledField.some(
              ({ x: filledX, y: filledY }) => x === filledX && filledY === y
            )
        )
      case Direction.Right:
        const potentialStrafeRightCoords =
          this.currentTetrominoAbsoluteCoords.map((coords) => ({
            ...coords,
            x: coords.x + 1,
          }))
        return !potentialStrafeRightCoords.some(
          ({ x, y }) =>
            x >= GRID_WIDTH ||
            this.filledField.some(
              ({ x: filledX, y: filledY }) => x === filledX && filledY === y
            )
        )
    }
  }

  checkCanRotateTetromino() {
    const potentialTetrominoRotation = getNextTetrominoRotation(
      this.currentTetromino,
      this.currentTetrominoRotation
    )
    const potentialTetrominoCoords = this.currentTetromino[
      potentialTetrominoRotation
    ].map((coords) => ({
      x: coords.x + this.currentTetrominoPosition.x,
      y: coords.y + this.currentTetrominoPosition.y,
    }))
    const x = potentialTetrominoCoords.map(({ x }) => x)
    const y = potentialTetrominoCoords.map(({ y }) => y)

    const maxY = Math.max(...y)
    const minX = Math.min(...x)
    const maxX = Math.max(...x)

    return (
      maxY < GRID_HEIGHT &&
      minX >= 0 &&
      maxX < GRID_WIDTH &&
      potentialTetrominoCoords.every(
        ({ x, y }) =>
          !this.filledField.some(
            ({ x: filledX, y: filledY }) => filledX === x && filledY === y
          )
      )
    )
  }

  checkGameOver() {}

  game() {
    if (this.pause || this.gameOver) {
      return
    }

    this.field = [
      ...this.filledField,
      ...this.currentTetrominoAbsoluteCoords.map((coords) => ({
        ...coords,
        color: this.currentColor,
      })),
    ]

    if (this.checkCanPullTetromino()) {
      this.isLastMove = false
      this.isFirstMove = false
      this.pullTetromino()
      return
    } else if (this.isFirstMove) {
      this.gameOver = true
      this.pause = true
      this.options.addScore(this.score)
      this.options.toggle()
    }

    if (!this.isLastMove) {
      this.isLastMove = true
    } else {
      this.isLastMove = false
      this.saveTetromino()
      this.destroyFilledRows()
      this.isFirstMove = true
      this.generateNextTetromino()
    }
  }

  save() {
    const toSave = {
      currentTetromino: {
        tetromino: this.currentTetromino,
        rotation: this.currentTetrominoRotation,
        position: this.currentTetrominoPosition,
        color: this.currentColor,
      },
      nextTetromino: {
        tetromino: this.nextTetromino,
        color: this.nextColor,
      },
      filledField: this.filledField,
      score: this.score,
    }

    localStorage.setItem(SAVE_AND_LOAD_KEY, JSON.stringify(toSave))
  }

  load() {
    const loadString = localStorage.getItem(SAVE_AND_LOAD_KEY)
    if (!loadString) {
      return
    }
    const toLoad = JSON.parse(loadString)
    this.filledField = toLoad.filledField
    this.currentTetromino = toLoad.currentTetromino.tetromino
    this.currentTetrominoRotation = toLoad.currentTetromino.rotation
    this.currentTetrominoPosition = toLoad.currentTetromino.position
    this.currentColor = toLoad.currentTetromino.color

    this.nextTetromino = toLoad.nextTetromino.tetromino
    this.nextColor = toLoad.nextTetromino.color

    this.score = toLoad.score
    this.renderScore()
  }

  render() {
    this.display.render(this.field)
    this.nextBlockDisplay.render(
      this.nextTetromino[0].map(({ x, y }) => ({
        x: x + NEXT_TETROMINO_POSITION.x,
        y: y + NEXT_TETROMINO_POSITION.y,
        color: this.nextColor,
      }))
    )
  }

  togglePause() {
    if (this.gameOver) {
      return
    }
    this.pause = !this.pause
    this.options.toggle()
  }

  renderScore() {
    this.scoreContainer.textContent = this.score.toString()
  }
}
