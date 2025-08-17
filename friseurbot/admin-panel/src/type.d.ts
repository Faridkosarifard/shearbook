// Allow importing .jsx modules from .tsx without type defs
declare module "*.jsx" {
  import React from "react";
  const Component: React.ComponentType<any>;
  export default Component;
}
