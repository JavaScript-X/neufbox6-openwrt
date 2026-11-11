# OpenWrt build environment (Debian 12) - runs as an unprivileged "builder" user (uid 1000)
FROM debian:bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential clang flex bison g++ gawk gcc-multilib g++-multilib gettext git \
      libncurses-dev libssl-dev python3 python3-setuptools python3-dev rsync swig unzip \
      zlib1g-dev file wget curl ca-certificates xz-utils zstd bzip2 patch perl time \
      quilt device-tree-compiler libelf-dev cpio less nano \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1000 builder
USER builder
WORKDIR /work
