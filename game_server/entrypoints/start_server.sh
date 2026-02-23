#!/bin/bash

# Start systemd gnaws service from file in internal folder
systemctl daemon-reload
systemctl start gnaws
