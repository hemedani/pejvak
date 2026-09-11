// React 19 requires an explicit act environment flag for React Native Testing
// Library's render/renderHook.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
