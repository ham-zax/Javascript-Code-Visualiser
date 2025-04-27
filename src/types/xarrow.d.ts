declare module 'react-xarrows' {
  import * as React from 'react';
  interface XarrowProps {
    start: React.RefObject<any> | string;
    end: React.RefObject<any> | string;
    color?: string;
    strokeWidth?: number;
    headSize?: number;
    zIndex?: number;
    [key: string]: any;
  }
  const Xarrow: React.FC<XarrowProps>;
  export default Xarrow;
}
