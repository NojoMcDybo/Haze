import React,{useState} from 'react';
// Aufklappbar wie in Nebel: Erklärungen und Hinweise sind da, drängen sich aber nicht auf.
export function More({label,children}:{label:string,children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <div className={'more'+(open?' open':'')}><button type="button" className="more-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}><span>{label}</span><i aria-hidden="true">+</i></button>
  <div className="more-body" inert={!open}><div>{children}</div></div></div>;
}
