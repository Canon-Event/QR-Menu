'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MorphIcon } from 'morphicons/react'
import { Menu, X } from 'lucide'
export default function EmployeeMobileMenu(){const[target,setTarget]=useState<Element|null>(null),[nav,setNav]=useState<Element|null>(null),[open,setOpen]=useState(false);useEffect(()=>{setTarget(document.querySelector('.ems-header > div:first-child'));setNav(document.querySelector('.ems-nav'))},[]);useEffect(()=>{nav?.classList.toggle('ems-menu-open',open);return()=>nav?.classList.remove('ems-menu-open')},[nav,open]);if(!target||!nav)return null;return <>{createPortal(<button className="ems-mobile-menu" aria-label="Toggle employee menu" aria-expanded={open} onClick={()=>setOpen(x=>!x)}><MorphIcon icon={open?X:Menu} size={18} strokeWidth={2} spring="snappy" reducedMotion="user"/></button>,target)}{open&&createPortal(<button className="ems-menu-close" aria-label="Close employee menu" onClick={()=>setOpen(false)}><MorphIcon icon={X} size={15} strokeWidth={2} reducedMotion="user"/> Close</button>,nav)}</>}
