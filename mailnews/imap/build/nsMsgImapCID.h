/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "NPL"); you may not use this file except in
 * compliance with the NPL.  You may obtain a copy of the NPL at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the NPL is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the NPL
 * for the specific language governing rights and limitations under the
 * NPL.
 *
 * The Initial Developer of this code under the NPL is Netscape
 * Communications Corporation.  Portions created by Netscape are
 * Copyright (C) 1998 Netscape Communications Corporation.  All Rights
 * Reserved.
 */

#ifndef nsMsgImapCID_h__
#define nsMsgImapCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"

#define NS_IMAPURL_CID							\
{ /* 21A89611-DC0D-11d2-806C-006008128C4E */	\
  0x21a89611, 0xdc0d, 0x11d2,					\
   { 0x80, 0x6c, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e }}

#define NS_IMAPSERVICE_CID						  \
{ /* C5852B22-EBE2-11d2-95AD-000064657374 */      \
 0xc5852b22, 0xebe2, 0x11d2,                      \
 {0x95, 0xad, 0x0, 0x0, 0x64, 0x65, 0x73, 0x74}}

#define NS_IMAPPROTOCOL_CID							\
{ /* 8C0C40D1-E173-11d2-806E-006008128C4E */		\
  0x8c0c40d1, 0xe173, 0x11d2,						\
    { 0x80, 0x6e, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e }}


#define NS_IIMAPHOSTSESSIONLIST_CID					\
{ /* 479ce8fc-e725-11d2-a505-0060b0fc04b7 */		\
  0x479ce8fc, 0xe725, 0x11d2,						\
	{0xa5, 0x05, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 }}

#define NS_IMAPINCOMINGSERVER_CID				  \
{ /* 8D3675E0-ED46-11d2-8077-006008128C4E */      \
 0x8d3675e0, 0xed46, 0x11d2,	                  \
 {0x80, 0x77, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e}}

#define NS_IMAPRESOURCE_CID						\
{ /* fa32d000-f6a0-11d2-af8d-001083002da8 */	\
  0xfa32d000, 0xf6a0, 0x11d2,					\
  { 0xaf, 0x8d, 0x00, 0x10, 0x83, 0x00, 0x2d, 0xa8 }}

#define NS_IMAPMESSAGERESOURCE_CID					\
{/* 225310c0-f69e-11d2-8d6d-00805f8a6617 */			\
    0x225310c0, 0xf69e, 0x11d2,						\
	{0x8d, 0x6d, 0x00, 0x80, 0x5f, 0x8a, 0x66, 0x17}} \

#endif // nsMsgImapCID_h__
