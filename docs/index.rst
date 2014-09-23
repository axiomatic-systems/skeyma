.. SKeyMa Simple Key Management Server documentation master file, created by Gilles

SKM API Documentation
=====================

The SKM API is a simple REST API designed to interface to local or remote key servers.
It is an **Open Specification** that may be implemented by different software packages, like the `SkeyMa <https://github.com/axiomatic-systems/skeyma>` Key Server, or online services, such as the `ExpressPlay <http://www.expressplay.com>` service. Different implementations of this API may differ slightly in the way they deal with access control, logging, and other functions, but the core SKM REST API documented here is common to all the implementations.

The purpose of the SKM API is to provide a very simple interface for software and services that need a simple and convenient way to store and/or retrieve cryptographic keys. This includes content packagers, head-end scramblers, DRM license servers, etc.

Contents:

.. toctree::
   :maxdepth: 3

   api/index
   api/examples

