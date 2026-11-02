workspace "Implicit identifiers" {
    model {
        payments = softwareSystem "Payments Core"
        softwareSystem "Payments"
        person "Payments"
        person "Model"
        softwareSystem "3D Viewer" {
            container "Web App"
            container "Web App 2"
        }
        element "#" "Hardware"
        custom = element "Printer"
        softwareSystem "Pay.ments/X"
    }
    views {
        systemLandscape {
            include *
        }
    }
}
