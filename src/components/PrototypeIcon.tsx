type Name = 'arrow'|'back'|'check'|'spark'|'cube'|'sun'|'leaf'|'upload'|'phone'|'grid'|'eye'|'chair'|'camera'|'palette'|'pin'|'export'|'plus'|'close'|'chevron'|'sliders'|'layers'|'trash'|'move'
export default function PrototypeIcon({name,className=''}:{name:Name;className?:string}) {
  return <svg className={`icon ${className}`} aria-hidden="true"><use href={`/forma-icons.svg#i-${name}`}/></svg>
}
