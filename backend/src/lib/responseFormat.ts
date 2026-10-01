export interface ApiResponse {
  code: number;
  data: any;
  message: string;
}

// 成功回调
export function success<T>(data: T | null = null, message: string = "成功"): ApiResponse {
  return {
    code: 200,
    data,
    message,
  };
}

// 客户端错误响应
export function error<T>(message: string = "", data: T | null = null): ApiResponse {
  return {
    code: 400,
    data,
    message,
  };
}

// 需图形验证码(登录/注册失败次数越过风控阈值)
// HTTP 走非 2xx(code=461 自创区间避开常用语义冲突),确保前端 axios 的
// response-failure 拦截器能把它当作 reject 正常捕获 —— 因 success 拦截器
// 不 inspect body.code 且页面 .then 仅取 inner data,若误返 200 会致空 token 登录灾难。
export function needCaptcha(
  data: any = null,
  message: string = "请完成图形验证",
): ApiResponse {
  return {
    code: 461,
    data,
    message,
  };
}
