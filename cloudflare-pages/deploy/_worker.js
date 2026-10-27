import { handleProxyRequest } from '../proxy.mjs';

export default {
  fetch(request, env) {
    return handleProxyRequest(request, env);
  },
};
