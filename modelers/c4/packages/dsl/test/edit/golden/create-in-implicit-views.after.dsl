workspace "Implicit" {
    model {
        customer = person "Customer"
        admin = person "Admin"
        shop = softwareSystem "Shop" {
            web = container "Web" {
                pages = component "Pages"
            }
        }
        mail = softwareSystem "Mail"
        customer -> web "Uses"
        shop -> mail "Sends with"
    }

    views {
        systemLandscape "SystemLandscape" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.admin" "-108,-108"
            }
        }
        systemContext mail "SystemContext-mail" {
            include *
            autoLayout tb 300 160
        }
        systemContext shop "SystemContext-shop" {
            include *
            autoLayout tb 300 160
        }
        container shop "Containers-shop" {
            include *
            autoLayout tb 300 160
        }
        component web "Components-web" {
            include *
            autoLayout tb 300 160
        }
    }
}
