// Register only the icons used by templates and dynamic sidebar entries.
import type { App } from "vue";
import { h } from "vue";
import Acoustic from "@icon-park/vue-next/es/icons/Acoustic";
import Api from "@icon-park/vue-next/es/icons/Api";
import ArrowDown from "@icon-park/vue-next/es/icons/ArrowDown";
import ArrowLeft from "@icon-park/vue-next/es/icons/ArrowLeft";
import ArrowRight from "@icon-park/vue-next/es/icons/ArrowRight";
import ArrowUp from "@icon-park/vue-next/es/icons/ArrowUp";
import AudioFile from "@icon-park/vue-next/es/icons/AudioFile";
import Brightness from "@icon-park/vue-next/es/icons/Brightness";
import CameraOne from "@icon-park/vue-next/es/icons/CameraOne";
import Check from "@icon-park/vue-next/es/icons/Check";
import CheckOne from "@icon-park/vue-next/es/icons/CheckOne";
import ClickToFold from "@icon-park/vue-next/es/icons/ClickToFold";
import Close from "@icon-park/vue-next/es/icons/Close";
import CloseOne from "@icon-park/vue-next/es/icons/CloseOne";
import CloseSmall from "@icon-park/vue-next/es/icons/CloseSmall";
import ColorFilter from "@icon-park/vue-next/es/icons/ColorFilter";
import Comments from "@icon-park/vue-next/es/icons/Comments";
import ContrastView from "@icon-park/vue-next/es/icons/ContrastView";
import Copy from "@icon-park/vue-next/es/icons/Copy";
import Cube from "@icon-park/vue-next/es/icons/Cube";
import CuttingOne from "@icon-park/vue-next/es/icons/CuttingOne";
import DarkMode from "@icon-park/vue-next/es/icons/DarkMode";
import Dashboard from "@icon-park/vue-next/es/icons/Dashboard";
import Delete from "@icon-park/vue-next/es/icons/Delete";
import DeleteOne from "@icon-park/vue-next/es/icons/DeleteOne";
import DocumentFolder from "@icon-park/vue-next/es/icons/DocumentFolder";
import Dot from "@icon-park/vue-next/es/icons/Dot";
import Down from "@icon-park/vue-next/es/icons/Down";
import Download from "@icon-park/vue-next/es/icons/Download";
import Earth from "@icon-park/vue-next/es/icons/Earth";
import Edit from "@icon-park/vue-next/es/icons/Edit";
import Editing from "@icon-park/vue-next/es/icons/Editing";
import Editor from "@icon-park/vue-next/es/icons/Editor";
import EmotionHappy from "@icon-park/vue-next/es/icons/EmotionHappy";
import Erase from "@icon-park/vue-next/es/icons/Erase";
import Exchange from "@icon-park/vue-next/es/icons/Exchange";
import ExpandTextInput from "@icon-park/vue-next/es/icons/ExpandTextInput";
import Export from "@icon-park/vue-next/es/icons/Export";
import FileText from "@icon-park/vue-next/es/icons/FileText";
import Film from "@icon-park/vue-next/es/icons/Film";
import Filter from "@icon-park/vue-next/es/icons/Filter";
import Fire from "@icon-park/vue-next/es/icons/Fire";
import Flashlamp from "@icon-park/vue-next/es/icons/Flashlamp";
import Fog from "@icon-park/vue-next/es/icons/Fog";
import FolderOpen from "@icon-park/vue-next/es/icons/FolderOpen";
import FullScreenOne from "@icon-park/vue-next/es/icons/FullScreenOne";
import Ghost from "@icon-park/vue-next/es/icons/Ghost";
import GoEnd from "@icon-park/vue-next/es/icons/GoEnd";
import GoStart from "@icon-park/vue-next/es/icons/GoStart";
import Heartbeat from "@icon-park/vue-next/es/icons/Heartbeat";
import Help from "@icon-park/vue-next/es/icons/Help";
import History from "@icon-park/vue-next/es/icons/History";
import Inbox from "@icon-park/vue-next/es/icons/Inbox";
import Landscape from "@icon-park/vue-next/es/icons/Landscape";
import Lightning from "@icon-park/vue-next/es/icons/Lightning";
import LoadingFour from "@icon-park/vue-next/es/icons/LoadingFour";
import Logout from "@icon-park/vue-next/es/icons/Logout";
import Magic from "@icon-park/vue-next/es/icons/Magic";
import Mail from "@icon-park/vue-next/es/icons/Mail";
import MenuFold from "@icon-park/vue-next/es/icons/MenuFold";
import MenuUnfold from "@icon-park/vue-next/es/icons/MenuUnfold";
import MenuUnfoldOne from "@icon-park/vue-next/es/icons/MenuUnfoldOne";
import Moon from "@icon-park/vue-next/es/icons/Moon";
import Movie from "@icon-park/vue-next/es/icons/Movie";
import MovieBoard from "@icon-park/vue-next/es/icons/MovieBoard";
import Music from "@icon-park/vue-next/es/icons/Music";
import Notebook from "@icon-park/vue-next/es/icons/Notebook";
import Paperclip from "@icon-park/vue-next/es/icons/Paperclip";
import Pause from "@icon-park/vue-next/es/icons/Pause";
import PauseOne from "@icon-park/vue-next/es/icons/PauseOne";
import People from "@icon-park/vue-next/es/icons/People";
import Permissions from "@icon-park/vue-next/es/icons/Permissions";
import Pic from "@icon-park/vue-next/es/icons/Pic";
import Platte from "@icon-park/vue-next/es/icons/Platte";
import Play from "@icon-park/vue-next/es/icons/Play";
import Plus from "@icon-park/vue-next/es/icons/Plus";
import PreviewOpen from "@icon-park/vue-next/es/icons/PreviewOpen";
import Receive from "@icon-park/vue-next/es/icons/Receive";
import Redo from "@icon-park/vue-next/es/icons/Redo";
import Refresh from "@icon-park/vue-next/es/icons/Refresh";
import Remind from "@icon-park/vue-next/es/icons/Remind";
import ReverseRotation from "@icon-park/vue-next/es/icons/ReverseRotation";
import Right from "@icon-park/vue-next/es/icons/Right";
import Robot from "@icon-park/vue-next/es/icons/Robot";
import Round from "@icon-park/vue-next/es/icons/Round";
import Save from "@icon-park/vue-next/es/icons/Save";
import Search from "@icon-park/vue-next/es/icons/Search";
import Send from "@icon-park/vue-next/es/icons/Send";
import SettingConfig from "@icon-park/vue-next/es/icons/SettingConfig";
import Shake from "@icon-park/vue-next/es/icons/Shake";
import Snowflake from "@icon-park/vue-next/es/icons/Snowflake";
import Star from "@icon-park/vue-next/es/icons/Star";
import SunOne from "@icon-park/vue-next/es/icons/SunOne";
import SwitchThemes from "@icon-park/vue-next/es/icons/SwitchThemes";
import Text from "@icon-park/vue-next/es/icons/Text";
import Time from "@icon-park/vue-next/es/icons/Time";
import Tips from "@icon-park/vue-next/es/icons/Tips";
import ToBottom from "@icon-park/vue-next/es/icons/ToBottom";
import Tool from "@icon-park/vue-next/es/icons/Tool";
import Toolkit from "@icon-park/vue-next/es/icons/Toolkit";
import Translate from "@icon-park/vue-next/es/icons/Translate";
import TreeDiagram from "@icon-park/vue-next/es/icons/TreeDiagram";
import Undo from "@icon-park/vue-next/es/icons/Undo";
import Upload from "@icon-park/vue-next/es/icons/Upload";
import UploadOne from "@icon-park/vue-next/es/icons/UploadOne";
import User from "@icon-park/vue-next/es/icons/User";
import Video from "@icon-park/vue-next/es/icons/Video";
import VideoFile from "@icon-park/vue-next/es/icons/VideoFile";
import VolumeMute from "@icon-park/vue-next/es/icons/VolumeMute";
import VolumeNotice from "@icon-park/vue-next/es/icons/VolumeNotice";
import Wallet from "@icon-park/vue-next/es/icons/Wallet";
import ZoomIn from "@icon-park/vue-next/es/icons/ZoomIn";
import ZoomOut from "@icon-park/vue-next/es/icons/ZoomOut";

/**
 * 即梦「创作」四角星（Sparkle）：path 取自其导航按钮的原始 SVG（80×80 viewBox），
 * 填充改 currentColor 以跟随侧栏文字色。IconPark 里没有同款，手绘功能组件仅此一枚。
 */
const Sparkle = () =>
  h("svg", { viewBox: "0 0 80 80", width: "1em", height: "1em", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, [
    h("path", {
      fill: "currentColor",
      d: "M36.847999572753906,7.921000003814697 C37.87900161743164,4.921000003814697 42.11899948120117,4.921000003814697 43.150001525878906,7.921000003814697 C43.150001525878906,7.921000003814697 44.19900131225586,10.968000411987305 44.19900131225586,10.968000411987305 C48.20600128173828,22.62700080871582 57.367000579833984,31.788000106811523 69.0260009765625,35.79499816894531 C69.0260009765625,35.79499816894531 72.0739974975586,36.845001220703125 72.0739974975586,36.845001220703125 C75.0739974975586,37.875999450683594 75.0739974975586,42.11600112915039 72.0739974975586,43.14699935913086 C72.0739974975586,43.14699935913086 69.0260009765625,44.196998596191406 69.0260009765625,44.196998596191406 C57.367000579833984,48.20399856567383 48.20600128173828,57.36399841308594 44.19900131225586,69.02300262451172 C44.19900131225586,69.02300262451172 43.150001525878906,72.07099914550781 43.150001525878906,72.07099914550781 C42.11899948120117,75.07099914550781 37.87900161743164,75.07099914550781 36.847999572753906,72.07099914550781 C36.847999572753906,72.07099914550781 35.79800033569336,69.02300262451172 35.79800033569336,69.02300262451172 C31.791000366210938,57.36399841308594 22.6299991607666,48.20399856567383 10.970999717712402,44.196998596191406 C10.970999717712402,44.196998596191406 7.922999858856201,43.14699935913086 7.922999858856201,43.14699935913086 C4.922999858856201,42.11600112915039 4.922999858856201,37.875999450683594 7.922999858856201,36.845001220703125 C7.922999858856201,36.845001220703125 10.970999717712402,35.79499816894531 10.970999717712402,35.79499816894531 C22.6299991607666,31.788000106811523 31.791000366210938,22.62700080871582 35.79800033569336,10.968000411987305 C35.79800033569336,10.968000411987305 36.847999572753906,7.921000003814697 36.847999572753906,7.921000003814697 C36.847999572753906,7.921000003814697 36.847999572753906,7.921000003814697 36.847999572753906,7.921000003814697z",
    }),
  ]);

/** 白模预演：胶片盘（即梦导演工具箱同款造型，描边风格与 IconPark 线性图标一致） */
const Reel = () =>
  h("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, [
    h("circle", { cx: "12.5", cy: "10.5", r: "7.6" }),
    h("circle", { cx: "12.5", cy: "10.5", r: "1.5", fill: "currentColor", stroke: "none" }),
    h("circle", { cx: "12.5", cy: "6.3", r: "1.25", fill: "currentColor", stroke: "none" }),
    h("circle", { cx: "16.7", cy: "10.5", r: "1.25", fill: "currentColor", stroke: "none" }),
    h("circle", { cx: "8.3", cy: "10.5", r: "1.25", fill: "currentColor", stroke: "none" }),
    h("circle", { cx: "12.5", cy: "14.7", r: "1.25", fill: "currentColor", stroke: "none" }),
    h("path", { d: "M10.8 18 9.4 20.8" }),
  ]);

const icons = {
  "i-acoustic": Acoustic,
  "i-api": Api,
  "i-arrow-down": ArrowDown,
  "i-arrow-left": ArrowLeft,
  "i-arrow-right": ArrowRight,
  "i-arrow-up": ArrowUp,
  "i-audio-file": AudioFile,
  "i-brightness": Brightness,
  "i-camera-one": CameraOne,
  "i-check": Check,
  "i-check-one": CheckOne,
  "i-click-to-fold": ClickToFold,
  "i-close": Close,
  "i-close-one": CloseOne,
  "i-close-small": CloseSmall,
  "i-color-filter": ColorFilter,
  "i-comments": Comments,
  "i-contrast-view": ContrastView,
  "i-copy": Copy,
  "i-cube": Cube,
  "i-cutting-one": CuttingOne,
  "i-dark-mode": DarkMode,
  "i-dashboard": Dashboard,
  "i-delete": Delete,
  "i-delete-one": DeleteOne,
  "i-document-folder": DocumentFolder,
  "i-dot": Dot,
  "i-down": Down,
  "i-download": Download,
  "i-earth": Earth,
  "i-edit": Edit,
  "i-editing": Editing,
  "i-editor": Editor,
  "i-emotion-happy": EmotionHappy,
  "i-erase": Erase,
  "i-exchange": Exchange,
  "i-expand-text-input": ExpandTextInput,
  "i-export": Export,
  "i-file-text": FileText,
  "i-film": Film,
  "i-filter": Filter,
  "i-fire": Fire,
  "i-flashlamp": Flashlamp,
  "i-fog": Fog,
  "i-folder-open": FolderOpen,
  "i-full-screen-one": FullScreenOne,
  "i-ghost": Ghost,
  "i-go-end": GoEnd,
  "i-go-start": GoStart,
  "i-heartbeat": Heartbeat,
  "i-help": Help,
  "i-history": History,
  "i-inbox": Inbox,
  "i-landscape": Landscape,
  "i-lightning": Lightning,
  "i-loading-four": LoadingFour,
  "i-logout": Logout,
  "i-magic": Magic,
  "i-mail": Mail,
  "i-menu-fold": MenuFold,
  "i-menu-unfold": MenuUnfold,
  "i-menu-unfold-one": MenuUnfoldOne,
  "i-moon": Moon,
  "i-reel": Reel,
  "i-sparkle": Sparkle,
  "i-movie": Movie,
  "i-movie-board": MovieBoard,
  "i-music": Music,
  "i-notebook": Notebook,
  "i-paperclip": Paperclip,
  "i-pause": Pause,
  "i-pause-one": PauseOne,
  "i-people": People,
  "i-permissions": Permissions,
  "i-pic": Pic,
  "i-platte": Platte,
  "i-play": Play,
  "i-plus": Plus,
  "i-preview-open": PreviewOpen,
  "i-receive": Receive,
  "i-redo": Redo,
  "i-refresh": Refresh,
  "i-remind": Remind,
  "i-reverse-rotation": ReverseRotation,
  "i-right": Right,
  "i-robot": Robot,
  "i-round": Round,
  "i-save": Save,
  "i-search": Search,
  "i-send": Send,
  "i-setting-config": SettingConfig,
  "i-shake": Shake,
  "i-snowflake": Snowflake,
  "i-star": Star,
  "i-sun-one": SunOne,
  "i-switch-themes": SwitchThemes,
  "i-text": Text,
  "i-time": Time,
  "i-tips": Tips,
  "i-to-bottom": ToBottom,
  "i-tool": Tool,
  "i-toolkit": Toolkit,
  "i-translate": Translate,
  "i-tree-diagram": TreeDiagram,
  "i-undo": Undo,
  "i-upload": Upload,
  "i-upload-one": UploadOne,
  "i-user": User,
  "i-video": Video,
  "i-video-file": VideoFile,
  "i-volume-mute": VolumeMute,
  "i-volume-notice": VolumeNotice,
  "i-wallet": Wallet,
  "i-zoom-in": ZoomIn,
  "i-zoom-out": ZoomOut,
};
export function installIcons(app: App) {
  for (const [name, icon] of Object.entries(icons)) app.component(name, icon);
}
