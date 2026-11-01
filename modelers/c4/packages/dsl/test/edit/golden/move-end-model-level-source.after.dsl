workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        crm = softwareSystem "CRM"
        customer -> web "Uses"
        api -> crm "Syncs customers" "HTTPS"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.crm" "400,280"
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.shop" "400,0"
            }
        }
        container shop "ShopContainers" {
            include *
            properties {
                "c4modeler.element.api" "0,560"
                "c4modeler.element.crm" "400,560"
                "c4modeler.element.customer" "12,0"
                "c4modeler.element.web" "0,280"
            }
        }
    }
}
