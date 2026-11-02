workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM" {
            -> web "Sends leads to"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
