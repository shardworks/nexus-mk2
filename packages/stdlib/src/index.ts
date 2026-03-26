// ── Tools (named exports) ──────────────────────────────────────────────
export { default as commissionCreate } from './tools/commission.ts';
export { default as commissionList } from './tools/commission-list.ts';
export { default as commissionShow } from './tools/commission-show.ts';
export { default as commissionUpdate } from './tools/commission-update.ts';
export { default as animaCreate } from './tools/instantiate.ts';
export { default as animaList } from './tools/anima-list.ts';
export { default as animaShow } from './tools/anima-show.ts';
export { default as animaUpdate } from './tools/anima-update.ts';
export { default as animaRemove } from './tools/anima-remove.ts';
export { default as workshopCreate } from './tools/workshop-create.ts';
export { default as workshopRegister } from './tools/workshop-register.ts';
export { default as workshopList } from './tools/workshop-list.ts';
export { default as workshopShow } from './tools/workshop-show.ts';
export { default as workshopRemove } from './tools/workshop-remove.ts';
export { default as toolInstall } from './tools/install.ts';
export { default as toolRemove } from './tools/remove.ts';
export { default as toolList } from './tools/tool-list.ts';
export { default as clockList } from './tools/clock-list.ts';
export { default as clockTick } from './tools/clock-tick.ts';
export { default as clockRun } from './tools/clock-run.ts';
export { default as clockStatus } from './tools/clock-status.ts';
export { default as clockStart } from './tools/clock-start.ts';
export { default as clockStop } from './tools/clock-stop.ts';
export { default as signal } from './tools/signal.ts';
export { default as nexusVersion } from './tools/nexus-version.ts';
export { default as workCreate } from './tools/work-create.ts';
export { default as workList } from './tools/work-list.ts';
export { default as workShow } from './tools/work-show.ts';
export { default as workUpdate } from './tools/work-update.ts';
export { default as pieceCreate } from './tools/piece-create.ts';
export { default as pieceList } from './tools/piece-list.ts';
export { default as pieceShow } from './tools/piece-show.ts';
export { default as pieceUpdate } from './tools/piece-update.ts';
export { default as jobCreate } from './tools/job-create.ts';
export { default as jobList } from './tools/job-list.ts';
export { default as jobShow } from './tools/job-show.ts';
export { default as jobUpdate } from './tools/job-update.ts';
export { default as strokeCreate } from './tools/stroke-create.ts';
export { default as strokeList } from './tools/stroke-list.ts';
export { default as strokeShow } from './tools/stroke-show.ts';
export { default as strokeUpdate } from './tools/stroke-update.ts';

// ── Engines ────────────────────────────────────────────────────────────
export { default as workshopPrepare } from './engines/workshop-prepare.ts';
export { default as workshopMerge } from './engines/workshop-merge.ts';

// ── Default export: all tools + engines as flat array ──────────────────
import commissionCreate from './tools/commission.ts';
import commissionList from './tools/commission-list.ts';
import commissionShow from './tools/commission-show.ts';
import commissionUpdate from './tools/commission-update.ts';
import animaCreate from './tools/instantiate.ts';
import animaList from './tools/anima-list.ts';
import animaShow from './tools/anima-show.ts';
import animaUpdate from './tools/anima-update.ts';
import animaRemove from './tools/anima-remove.ts';
import workshopCreate from './tools/workshop-create.ts';
import workshopRegister from './tools/workshop-register.ts';
import workshopList from './tools/workshop-list.ts';
import workshopShow from './tools/workshop-show.ts';
import workshopRemove from './tools/workshop-remove.ts';
import toolInstall from './tools/install.ts';
import toolRemove from './tools/remove.ts';
import toolList from './tools/tool-list.ts';
import clockList from './tools/clock-list.ts';
import clockTick from './tools/clock-tick.ts';
import clockRun from './tools/clock-run.ts';
import clockStatus from './tools/clock-status.ts';
import clockStartTool from './tools/clock-start.ts';
import clockStopTool from './tools/clock-stop.ts';
import signal from './tools/signal.ts';
import nexusVersion from './tools/nexus-version.ts';
import workCreate from './tools/work-create.ts';
import workList from './tools/work-list.ts';
import workShow from './tools/work-show.ts';
import workUpdate from './tools/work-update.ts';
import pieceCreate from './tools/piece-create.ts';
import pieceList from './tools/piece-list.ts';
import pieceShow from './tools/piece-show.ts';
import pieceUpdate from './tools/piece-update.ts';
import jobCreate from './tools/job-create.ts';
import jobList from './tools/job-list.ts';
import jobShow from './tools/job-show.ts';
import jobUpdate from './tools/job-update.ts';
import strokeCreate from './tools/stroke-create.ts';
import strokeList from './tools/stroke-list.ts';
import strokeShow from './tools/stroke-show.ts';
import strokeUpdate from './tools/stroke-update.ts';
import workshopPrepare from './engines/workshop-prepare.ts';
import workshopMerge from './engines/workshop-merge.ts';

export default [
  commissionCreate, commissionList, commissionShow, commissionUpdate,
  animaCreate, animaList, animaShow, animaUpdate, animaRemove,
  workshopCreate, workshopRegister, workshopList, workshopShow, workshopRemove,
  toolInstall, toolRemove, toolList,
  clockList, clockTick, clockRun, clockStatus, clockStartTool, clockStopTool,
  signal, nexusVersion,
  workCreate, workList, workShow, workUpdate,
  pieceCreate, pieceList, pieceShow, pieceUpdate,
  jobCreate, jobList, jobShow, jobUpdate,
  strokeCreate, strokeList, strokeShow, strokeUpdate,
  workshopPrepare, workshopMerge,
];
