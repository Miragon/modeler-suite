workspace {
    model {
        customer = person "Customer"
        deploymentEnvironment "Live" {
            deploymentNode "Server"
        }
        late = softwareSystem "Late"
        customer -> late "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
