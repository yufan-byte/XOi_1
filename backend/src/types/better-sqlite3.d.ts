// better-sqlite3 的运行时依赖已安装；仓库内的迁移脚本只需要其构造器类型。
declare module "better-sqlite3" {
  const Database: any;
  export default Database;
}
