declare namespace JSX {
  type Element = any;
  type ElementClass = any;
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface ElementAttributesProperty {
    props: any;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
    ref?: any;
  }
}

declare module 'react' {
  export const Fragment: any;
  export function createElement(type: any, props: any, ...children: any[]): any;
  export default any;
}

declare module 'react-dom/client' {
  export function createRoot(element: any): { render(children: any): void };
}

declare module 'react/jsx-runtime' {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export function jsxDEV(type: any, props: any, key?: any): any;
}
