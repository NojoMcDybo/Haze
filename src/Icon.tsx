import React from 'react';
import {NOJO_ICONS,type IconName} from './nojo/nojo-icons';

// Symbole aus der gemeinsamen Bibliothek (D:\Dev\nojo-design\assets\icons.mjs, Kopie unter src/nojo/):
// gleiche Bedeutung = gleiches Symbol in Haze, Notch, Helio, Arena und Folio.
const ATTR:Record<string,React.SVGProps<SVGSVGElement>>={
 line:{fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round'},
 glyph:{fill:'currentColor'},
 color:{},
};
export function Icon({name,size=20,className=''}:{name:IconName;size?:number;className?:string}){
 const i=NOJO_ICONS[name];
 return <svg viewBox="0 0 24 24" width={size} height={size} style={{width:size,height:size}} className={`n-i n-i-${i.kind} ${className}`.trim()} aria-hidden="true" {...ATTR[i.kind]} dangerouslySetInnerHTML={{__html:i.body}}/>;
}
