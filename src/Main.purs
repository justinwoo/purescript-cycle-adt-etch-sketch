module Main where

import Prelude
import Control.Cycle (CYCLE, run)
import Control.Monad.Eff (Eff)
import Control.XStream (STREAM, Stream, addListener, fold, fromCallback)
import Data.Generic (gShow, class Generic)
import Data.Monoid (mempty)
import Data.Set (Set, insert)

data Direction
  = Up
  | Down
  | Left
  | Right

data Coords = Coords Int Int
derive instance eqCoords :: Eq Coords
derive instance ordCoords :: Ord Coords
derive instance genericCoords :: Generic Coords
instance showCoords :: Show Coords where
  show = gShow

data State = State
  { cursor :: Coords
  , points :: Set Coords
  , width :: Int
  , height :: Int
  , increment :: Int
  }

initialState :: State
initialState = State
  { cursor: Coords 0 0
  , points: mempty
  , width: 800
  , height: 600
  , increment: 10
  }

isInvalidPoint :: Coords -> State -> Boolean
isInvalidPoint (Coords x y) (State state) =
  x < 0 || (state.increment * x) > (state.width - state.increment) ||
  y < 0 || (state.increment * y) > (state.height - state.increment)

foreign import data KEYBOARD :: !
foreign import onKeyboardDown :: forall e.
  ( Int ->
    Eff
      ( kb :: KEYBOARD
      , stream :: STREAM
      | e
      )
      Unit
  ) ->
  Eff
    ( kb :: KEYBOARD
    , stream :: STREAM
    | e
    )
    Unit

kb :: forall e.
  Eff
    ( kb :: KEYBOARD
    , stream :: STREAM
    | e
    )
    (Stream Direction)
kb = do
  keycodes <- fromCallback onKeyboardDown
  pure $ keyCodeToQuery =<< keycodes
  where
    keyCodeToQuery = case _ of
      38 -> pure Up
      40 -> pure Down
      37 -> pure Left
      39 -> pure Right
      _ -> mempty

data Query
  = MoveCursor Direction

data Action
  = App Query
  | SomeOtherAction

data Command
  = Output State
  | SomeOtherCommand

app :: Stream Action -> Stream Command
app actions = do
  Output <$> fold eval initialState actions
  where
    shiftCursor direction (Coords x y) = case direction of
      Up -> Coords x (y - 1)
      Down -> Coords x (y + 1)
      Left -> Coords (x - 1) y
      Right -> Coords (x + 1) y
    eval state@(State state') (App (MoveCursor direction)) = do
      let cursor' = shiftCursor direction state'.cursor
      if isInvalidPoint cursor' state
        then state
        else State $
          state'
          { cursor = cursor'
          , points = insert state'.cursor state'.points
          }
    eval state _ = state

driver :: forall e.
  Stream Command ->
  Eff
    ( kb :: KEYBOARD
    , stream :: STREAM
    , dom :: DOM
    | e
    )
    (Stream Action)
driver commands = do
  addListener
    { next: logState
    , error: const $ pure unit
    , complete: const $ pure unit
    }
    $ extractOutput =<< commands
  directions <- kb
  pure $ App <<< MoveCursor <$> directions
  where
    extractOutput (Output state) = pure state
    extractOutput _ = mempty

foreign import data DOM :: !
foreign import writeToDOM :: forall e. String -> Eff (dom :: DOM | e) Unit

logState :: forall e.
  State ->
  Eff
    ( dom :: DOM
    | e
    )
    Unit
logState (State state) = do
  writeToDOM $ "cursor: " <> show state.cursor

main :: forall e.
  Eff
    ( cycle :: CYCLE
    , kb :: KEYBOARD
    , stream :: STREAM
    , dom :: DOM
    | e
    )
    Unit
main = do
  run app driver
