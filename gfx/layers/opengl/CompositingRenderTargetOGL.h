/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_COMPOSITINGRENDERTARGETOGL_H
#define MOZILLA_GFX_COMPOSITINGRENDERTARGETOGL_H

#include "mozilla/layers/Compositor.h"

#ifdef MOZ_DUMP_PAINTING
#include "mozilla/layers/CompositorOGL.h"
#endif

namespace mozilla {
namespace layers {

class CompositingRenderTargetOGL : public CompositingRenderTarget,
                                   public TextureSourceOGL
{
  typedef mozilla::gl::GLContext GLContext;

public:
  CompositingRenderTargetOGL(GLContext* aGL)
    : mGL(aGL) 
  {}

  TextureSourceOGL* AsSourceOGL() MOZ_OVERRIDE { return this; }

  gfx::IntSize GetSize() const MOZ_OVERRIDE { return mSize; }

  gl::BindableTexture* GetTexture() const MOZ_OVERRIDE {
    NS_RUNTIMEABORT("Not implemented");
    return nullptr;
  }

  bool IsValid() const MOZ_OVERRIDE { return false ; } // TODO[nical] not implemented

  ~CompositingRenderTargetOGL()
  {
    mGL->fDeleteTextures(1, &mTexture);
    mGL->fDeleteFramebuffers(1, &mFBO);
  }

#ifdef MOZ_DUMP_PAINTING
  virtual already_AddRefed<gfxImageSurface> Dump(Compositor* aCompositor)
  {
    CompositorOGL* compositorOGL = static_cast<CompositorOGL*>(aCompositor);
    return mGL->GetTexImage(mTexture, true, compositorOGL->GetFBOLayerProgramType());
  }
#endif

  gfx::IntSize mSize;
  GLuint mTexture;
  GLuint mFBO;

private:
  GLContext* mGL;
};


}
}

#endif /* MOZILLA_GFX_SURFACEOGL_H */
