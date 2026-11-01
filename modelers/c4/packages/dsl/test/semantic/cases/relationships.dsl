workspace {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API" {
                this -> web "Serves"
                -> customer "Emails"
                customer -> this "Calls"
            }
        }
        mail = softwareSystem "Mail"
        printer = element "Printer" "Hardware"
        customer -> web
        customer -> shop "Buys from"
        customer -> shop "Returns to"
        shop -> mail "Sends"
        shop -> mail "Sends receipts" "SMTP" "Async"
        printer -> customer "Prints for"
        mail -> printer
        named = mail -> customer "Delivers"
        properties {
            "x" "y"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            exclude "shop->mail"
            exclude named
        }
        systemContext shop "Context" {
            include *?
        }
        container shop "Containers" {
            include customer web api
            include ->api->
        }
    }
}
